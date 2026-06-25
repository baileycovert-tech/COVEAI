import { NextRequest, NextResponse } from "next/server";
import { getInventoryUnits, getDeals, getCustomers, getPipeline, getReps, money } from "../../lib/data";
import { dmsQuery } from "../../lib/dms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// "Ask the CRM" — Bailey's sales-desk assistant. With ANTHROPIC_API_KEY it's a full
// Claude agent that can query the LIVE DMS and search inventory (like his Cowork
// assistant). Without a key it falls back to a basic local keyword lookup.

function localInventorySearch(query: string) {
  const units = getInventoryUnits().units;
  const STOP = new Set("the a an is are of for me my our we in on at to with what color stock vin trim price cheapest best aged new used car truck vehicle show find any all and or under over".split(" "));
  const terms = (query.toLowerCase().match(/[a-z0-9-]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
  const hit = units.filter((u) => {
    const hay = `${u.stock} ${u.vin} ${u.year} ${u.model} ${u.trim} ${u.ext} ${u.int} ${u.store} ${u.status}`.toLowerCase();
    return terms.every((t) => hay.includes(t) || (t.endsWith("s") && hay.includes(t.slice(0, -1))));
  });
  return hit.slice(0, 25).map((u) => ({ stock: u.stock, vin: u.vin, vehicle: `${u.year} ${u.model} ${u.trim}`.trim(), color: u.ext, interior: u.int, price: u.price, age_days: u.age, status: u.status, store: u.store }));
}

function crmSnapshot() {
  const p = getPipeline();
  const cols = (p.columns || []).map((c: any) => `${c.title}: ${c.leads.length}`).join(", ");
  const hot = (p.columns?.find((c: any) => c.key === "hot")?.leads || []).slice(0, 8).map((l: any) => `${l.name} (${l.vehicle})`).join("; ");
  const reps = getReps();
  return `Pipeline (${p.standing || ""}) — ${cols}. Needs-first-contact: ${hot || "none"}. Board month: ${reps.month || ""}.`;
}

const SYSTEM = `You are Bailey Covert's sales-desk assistant, embedded in his Covert CRM web app. Talk like a sharp, concise desk manager — direct, useful, no fluff.

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
];

async function runTool(name: string, input: any): Promise<string> {
  try {
    if (name === "query_dms") {
      const rows = await dmsQuery(String(input.sql || ""));
      let out = JSON.stringify(rows);
      if (out.length > 9000) out = out.slice(0, 9000) + ` …(truncated; ${rows.length} rows — add a tighter LIMIT)`;
      return out;
    }
    if (name === "search_inventory") {
      return JSON.stringify(localInventorySearch(String(input.query || "")));
    }
    return `Unknown tool ${name}`;
  } catch (e: any) {
    return `TOOL ERROR: ${e.message}`;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const question = String(body.question || "").trim();
  const history: { role: string; text: string }[] = Array.isArray(body.history) ? body.history : [];
  if (!question) return NextResponse.json({ answer: "Ask me anything — deals, leads, inventory, a customer, or 'draft a text to …'." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // No LLM available — basic local lookup + tell Bailey how to turn on the real assistant.
    const inv = localInventorySearch(question);
    const tip = "⚙️ I'm in basic lookup mode. To make me your full assistant (live DMS queries, follow-ups, drafting — like Cowork), add an ANTHROPIC_API_KEY to .env.local and rebuild. ";
    if (inv.length) return NextResponse.json({ answer: tip + `\n\nFound ${inv.length} inventory match(es):\n` + inv.slice(0, 6).map((u: any) => `• ${u.stock} — ${u.vehicle}, ${u.color}, ${u.price ? money(u.price) : "n/a"}, ${u.age_days}d, ${u.status}`).join("\n"), source: "lookup" });
    return NextResponse.json({ answer: tip, source: "lookup" });
  }

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const model = process.env.ASSISTANT_MODEL || "claude-sonnet-4-6";

    const messages: any[] = [
      ...history.slice(-8).map((m) => ({ role: m.role === "you" ? "user" : "assistant", content: m.text })),
      { role: "user", content: question },
    ];
    const system = SYSTEM + "\n\nCURRENT CRM SNAPSHOT (already loaded — use without querying):\n" + crmSnapshot();

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
      for (const tu of toolUses) results.push({ type: "tool_result", tool_use_id: tu.id, content: await runTool(tu.name, tu.input) });
      messages.push({ role: "user", content: results });
    }
    return NextResponse.json({ answer: "That took too many steps — try narrowing the question.", source: "ai" });
  } catch (e: any) {
    return NextResponse.json({ answer: `Assistant error: ${e.message}. (Check ANTHROPIC_API_KEY / model.)`, source: "error" });
  }
}
