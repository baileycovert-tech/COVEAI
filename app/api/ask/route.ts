import { NextRequest, NextResponse } from "next/server";
import { getInventoryUnits, getDeals, getCustomers, getPipeline, getReps, getOutreachTargets, pipelineFor, outreachTargetsFor, money, type Viewer } from "../../lib/data";
import { dmsQuery } from "../../lib/dms";
import { draftMessage } from "../../lib/anthropic";
import { lookupContact } from "../../lib/contacts";
import { currentUser } from "../../lib/auth";

// Reps get the full assistant — their numbers, inventory, leads, drafting. The ONLY thing
// held back from a non-manager login is the lot's aggregate inventory value/worth (and unit
// cost/margin that backs it). Everything else (gross, pace, deals) is fair game.
const FINANCIAL_SQL = /\bcost\b|\bmargin\b|inventory[_ ]?(value|worth)|(sum|avg|total)\s*\(\s*"?(list_price|msrp|cost)/i;
const RESTRICTED_MSG = "I can't share the lot's total inventory value or unit cost on your login. Everything else is fair game — inventory, your leads, follow-ups, drafts, and your numbers.";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Ask the CRM" — Bailey's sales-desk assistant. With ANTHROPIC_API_KEY it's a full
// Claude agent that can query the LIVE DMS and search inventory (like his Cowork
// assistant). Without a key it falls back to a basic local keyword lookup.

function localInventorySearch(query: string) {
  const units = getInventoryUnits().units;
  const STOP = new Set("the a an is are of for me my our we in on at to with what color stock vin trim price cheapest best aged new car truck trucks suv suvs sedan sedans coupe van minivan vehicle vehicles show find me any all and or under over have got".split(" "));
  const terms = (query.toLowerCase().match(/[a-z0-9-]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
  const hit = units.filter((u) => {
    const hay = `${u.stock} ${u.vin} ${u.year} ${u.make || ""} ${u.model} ${u.trim} ${u.ext} ${u.int} ${u.store} ${u.condition || ""} ${u.status}`.toLowerCase();
    return terms.every((t) => hay.includes(t) || (t.endsWith("s") && hay.includes(t.slice(0, -1))));
  });
  return hit.slice(0, 25).map((u) => ({ stock: u.stock, vin: u.vin, vehicle: `${u.year} ${u.store === "Used" && u.make ? u.make + " " : ""}${u.model} ${u.trim || ""}`.replace(/\s+/g, " ").trim(), color: u.ext && !/^nan$/i.test(u.ext) ? u.ext : "", interior: u.int, internet_price: u.internet ?? u.price, list_price: u.price, mileage: u.mileage, age_days: u.age, status: u.status, store: u.store }));
}

function crmSnapshot(me: Viewer) {
  const p = pipelineFor(me);   // viewer-scoped: a rep sees their own pipeline, never the owner's
  const cols = (p.columns || []).map((c: any) => `${c.title}: ${c.leads.length}`).join(", ");
  const hot = (p.columns?.find((c: any) => c.key === "hot")?.leads || []).slice(0, 8).map((l: any) => `${l.name} (${l.vehicle})`).join("; ");
  const reps = getReps();
  return `Pipeline (${p.standing || ""}) — ${cols}. Needs-first-contact: ${hot || "none"}. Board month: ${reps.month || ""}.`;
}

const SYSTEM = `You are COVE, Bailey Covert's AI sales assistant, embedded in his COVE app. Talk like a sharp, concise desk manager — direct, useful, no fluff. If asked your name, you're COVE.

FORMAT FOR A NARROW PHONE CHAT PANEL: short bullet lists, not wide markdown tables. Keep lines short. Lead with the answer.

WHO: Bailey Covert, salesman at Covert Ford Chevrolet Hutto. Cell 512-777-9404. S1 numbers: Chevy 1249, Ford 3001249. His DMS rep name matches POSITION('Bailey' IN COALESCE(sales_rep,'')) > 0.

YOU HAVE LIVE DATA. Use the query_dms tool to answer ANYTHING about deals, leads, inventory, F&I, sales pace, service, employees — it runs read-only SQL on the same dealership DMS the desktop assistant uses.

DMS RULES (critical):
- Postgres. NEVER use ILIKE or the % wildcard — it throws "tuple index out of range" on NaN columns. Use POSITION('x' IN COALESCE(col,'')) > 0 for text matching.
- run_query is SELECT-only. ALWAYS add LIMIT (<= 50).
- Key tables/columns:
  • scorecard_leads — CRM leads: customer, sales_rep, lead_status, lead_status_type ('Active'/'Sold'/'Bad'/'Lost'), contacted_indicator, year, make, model, trim, stock_number, vin, lead_source, lead_origination_date, last_customer_contact, sold_datetime
  • scorecard_sales — sold deals: customer, sales_representative, sold_date, stock_number, inventory_type, total_gross
  • sales_pace — MTD pace (quoted upper-case cols): "S1-NUMBER","DATE","FRONT-GROSS","BACK-GROSS","NUO","LAST-NAME","STK-NO","DEAL"
  • ford_inventory_current / chevy_inventory_current — unit level: stock_number, vin, year, model, standardized_model, standardized_trim, exterior_color, interior_color, list_price, cost, age, status ('IN-STOCK','SOLD','LOANER'...)
  • fi_deals, used_inventory, employees, scorecard_appointments
- "Open leads" filter: lead_status NOT IN ('Delivered','Sold','Lost','Dead','Duplicate lead','Lead process completed','Out of market').
- For quick inventory lookups you may use search_inventory (local snapshot of new + used units, all makes) instead of SQL.

DRAFTING TEXTS (when asked to write/draft a customer message) — LOCKED VOICE:
"Hey [FirstName] — Bailey Covert at Covert Hutto, your guy on the [Year] [Make] [Model] [Trim]. Reaching out direct from my cell. What time can you make it out today?"
First name only. NO price, NO Carfax, NO photos, NO emoji. Always end with an appointment ask. Adapt naturally but keep that backbone.

NEVER fabricate a stock #, VIN, price, gross, name, or date. If you don't have it, query the DMS or say you don't know. Keep answers tight; use short lists. Money like $1,234.`;

const TOOLS = [
  {
    name: "query_dms",
    description: "Run a read-only SELECT against the live GMReview dealership DMS (Postgres). Use POSITION()/COALESCE() never ILIKE/%. Always LIMIT <= 50. Returns JSON rows.",
    input_schema: { type: "object", properties: { sql: { type: "string", description: "A single SELECT statement." } }, required: ["sql"] },
  },
  {
    name: "search_inventory",
    description: "Search the local snapshot of available new + used inventory (all makes) units by stock #, VIN, color, model, or trim. Faster than SQL for simple lot lookups.",
    input_schema: { type: "object", properties: { query: { type: "string", description: "e.g. 'white f-150 lariat' or a stock number" } }, required: ["query"] },
  },
  {
    name: "lookup_contact",
    description: "Look up a phone number / email for a person in Bailey's ~35k saved contacts (dealership customers + his network + iPhone). Use when a CRM record is missing a phone.",
    input_schema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" } } },
  },
];

async function runTool(name: string, input: any, restricted = false, isAdmin = false): Promise<string> {
  try {
    if (name === "query_dms") {
      if (restricted && FINANCIAL_SQL.test(String(input.sql || ""))) return "REFUSED: " + RESTRICTED_MSG;
      const rows = await dmsQuery(String(input.sql || ""));
      let out = JSON.stringify(rows);
      if (out.length > 9000) out = out.slice(0, 9000) + ` …(truncated; ${rows.length} rows — add a tighter LIMIT)`;
      return out;
    }
    if (name === "search_inventory") {
      return JSON.stringify(localInventorySearch(String(input.query || "")));
    }
    if (name === "lookup_contact") {
      // The 35k contacts index is the owner's personal phone book — only the owner/admin may query it.
      if (!isAdmin) return "Contact lookup isn't available on your login — it only covers your own records.";
      const hit = lookupContact(input.name, input.phone);
      return hit ? JSON.stringify(hit) : "No contact found in the 35k saved contacts for that name/phone.";
    }
    return `Unknown tool ${name}`;
  } catch (e: any) {
    return `TOOL ERROR: ${e.message}`;
  }
}

// ---- No-key router: handle the common sales-desk questions with LIVE DMS queries
// (and the voice-locked template drafter), so the assistant is useful without an LLM. ----
const OPEN = "lead_status NOT IN ('Delivered','Sold','Lost','Dead','Duplicate lead','Lead process completed','Out of market')";
async function routedLookup(question: string, restricted = false, me: Viewer = null): Promise<string | null> {
  const ql = question.toLowerCase();

  // DRAFT a customer message — voice-locked template. (whole-word name match)
  if (/\b(draft|write|text|message|send|reach out to)\b/.test(ql)) {
    const words = new Set(ql.match(/[a-z]+/g) || []);
    const targets = outreachTargetsFor(me);
    const m = targets.find((c) => {
      const parts = c.name.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
      const last = parts[parts.length - 1];
      return last && words.has(last);
    });
    if (m) {
      const channel = /email/.test(ql) ? "email" : "text";
      const d = await draftMessage({ customer: m as any, channel: channel as any, intent: "" });
      return `Draft ${channel} to ${m.name}${m.phone ? "" : " (⚠ no contact on file — add a number to send)"}:\n\n${d.subject ? "Subject: " + d.subject + "\n\n" : ""}${d.body}`;
    }
  }

  try {
    // FOLLOW-UPS — open leads gone quiet.
    if (/\b(follow.?up|who.*(call|reach|contact|work)|need.*call|chase|stale|cold|left to)\b/.test(ql)) {
      const rows = await dmsQuery(`SELECT customer, year, make, model, lead_status, COALESCE(last_customer_contact::text, lead_origination_date::text) AS last FROM scorecard_leads WHERE POSITION('Bailey' IN COALESCE(sales_rep,'')) > 0 AND lead_status IN ('Active Lead','New Lead','Waiting for prospect response') AND lead_origination_date >= (CURRENT_DATE - INTERVAL '60 days') AND (last_customer_contact IS NULL OR last_customer_contact < (NOW() - INTERVAL '3 days')) ORDER BY COALESCE(last_customer_contact, lead_origination_date) ASC LIMIT 12`);
      const seen = new Set<string>();
      const uniq = rows.filter((r: any) => { const k = (r.customer || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
      if (!uniq.length) return "No open leads have gone quiet — you're caught up.";
      return `Follow up with these (quietest first):\n` + uniq.slice(0, 10).map((r: any) => `• ${r.customer} — ${[r.year, r.make, r.model].filter(Boolean).join(" ") || "vehicle TBD"} · last touch ${(r.last || "never").slice(0, 10)} · ${r.lead_status}`).join("\n");
    }
    // PACE / how am I doing this month.
    if (/\b(pace|this month|how.*doing|standing|mtd|my (units|gross|numbers|month)|where am i)\b/.test(ql)) {
      if (restricted) return "Your month-to-date numbers are on your Sales Board. Store-wide and other-rep financials aren't available on your login.";
      const first = new Date().toISOString().slice(0, 8) + "01";
      const rows = await dmsQuery(`SELECT "NUO" AS nuo, COUNT(*) AS units, COALESCE(SUM("FRONT-GROSS"),0)::numeric(12,0) AS front, COALESCE(SUM("BACK-GROSS"),0)::numeric(12,0) AS back FROM sales_pace WHERE "S1-NUMBER" IN ('1249','3001249') AND "DATE" >= '${first}' GROUP BY "NUO"`);
      const u = rows.reduce((n: number, r: any) => n + Number(r.units || 0), 0);
      const g = rows.reduce((n: number, r: any) => n + Number(r.front || 0) + Number(r.back || 0), 0);
      const split = rows.map((r: any) => `${Number(r.units)} ${r.nuo}`).join(" / ");
      return `Month-to-date pace (DMS sales_pace): ${u} units (${split}) for ${money(g)} gross.`;
    }
    // STOCK # lookup — across new + used + sold.
    const stock = (question.match(/\b([A-Za-z]?\d{4,8}[A-Za-z]?)\b/) || [])[1];
    if (stock && /\b(stock|stk|vin|deal|who|color|trim|price)\b/.test(ql)) {
      const inv = localInventorySearch(stock);
      if (inv.length) { const u: any = inv[0]; return `Stock ${u.stock}: ${u.vehicle}, ${u.color}, ${u.price ? money(u.price) : "price n/a"}, ${u.age_days}d on lot, ${u.status}. VIN ${u.vin}.`; }
      const sold = await dmsQuery(`SELECT customer, sold_date, total_gross FROM scorecard_sales WHERE POSITION('${stock}' IN COALESCE(stock_number,'')) > 0 LIMIT 3`);
      if (sold.length) return `Stock ${stock} — sold deal(s):\n` + sold.map((s: any) => `• ${s.customer}, ${(s.sold_date || "").slice(0, 10)}${restricted ? "" : `, gross ${money(Number(s.total_gross || 0))}`}`).join("\n");
    }
  } catch (e: any) { return `DMS lookup failed: ${e.message}`; }

  // Inventory keyword search (covers color/model/trim/used).
  const inv = localInventorySearch(question);
  if (inv.length) return `Found ${inv.length} unit(s):\n` + inv.slice(0, 8).map((u: any) => `• ${u.stock} — ${u.vehicle}, ${u.color || "—"}, ${u.price ? money(u.price) : "n/a"}, ${u.age_days}d, ${u.status}`).join("\n");
  return null;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const history: { role: string; text: string }[] = Array.isArray(body.history) ? body.history : [];
  if (!question) return NextResponse.json({ answer: "Ask me anything — deals, leads, inventory, a customer, or 'draft a text to …'." });

  // Viewer scope: a salesperson login (not admin/manager) may not pull store financials, and only
  // the owner/admin's chatbot may see the owner's pipeline/customers/contacts.
  const me = currentUser();
  const restricted = !(me?.seesFinancials);
  const isAdmin = !!me?.isAdmin;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // No LLM — route to live DMS for the common questions; tell Bailey how to unlock full chat.
    const ans = await routedLookup(question, restricted, me);
    const tip = "\n\n— (Basic mode. For full back-and-forth like Cowork, add an ANTHROPIC_API_KEY: ./scripts/set-api-key.sh sk-ant-…)";
    return NextResponse.json({ answer: (ans || "I can pull follow-ups, your pace, a stock #, a customer, inventory, or draft a text. Try one of those.") + tip, source: "lookup" });
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const model = process.env.ASSISTANT_MODEL || "claude-sonnet-4-6";

    const messages: any[] = [
      ...history.slice(-8).map((m) => ({ role: m.role === "you" ? "user" : "assistant", content: m.text })),
      { role: "user", content: question },
    ];
    const policy = restricted
      ? "\n\nACCESS LEVEL — SALESPERSON: full assistant. Help with inventory, their leads/customers, follow-ups, pace, their own sold numbers and gross, and message drafts. The ONLY thing you must NOT reveal is the lot's aggregate INVENTORY VALUE/WORTH or unit COST/margin. If asked for that, reply exactly: \"" + RESTRICTED_MSG + "\" Everything else is fine."
      : "";
    const system = SYSTEM + policy + "\n\nCURRENT CRM SNAPSHOT (already loaded — use without querying):\n" + crmSnapshot(me);

    // Agentic tool-use loop.
    for (let i = 0; i < 6; i++) {
      const resp: any = await client.messages.create({ model, max_tokens: 1024, system, tools: TOOLS as any, messages });
      const toolUses = resp.content.filter((b: any) => b.type === "tool_use");
      if (!toolUses.length || resp.stop_reason !== "tool_use") {
        const text = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("").trim();
        return NextResponse.json({ answer: text || "(no answer)", source: "ai" });
      }
      messages.push({ role: "assistant", content: resp.content });
      const results = [];
      for (const tu of toolUses) results.push({ type: "tool_result", tool_use_id: tu.id, content: await runTool(tu.name, tu.input, restricted, isAdmin) });
      messages.push({ role: "user", content: results });
    }
    return NextResponse.json({ answer: "That took too many steps — try narrowing the question.", source: "ai" });
  } catch (e: any) {
    return NextResponse.json({ answer: `Assistant error: ${e.message}. (Check ANTHROPIC_API_KEY / model.)`, source: "error" });
  }
}
