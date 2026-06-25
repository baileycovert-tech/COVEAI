import { NextRequest, NextResponse } from "next/server";
import { getInventoryUnits, getDeals, getCustomers, getReps, money } from "../../lib/data";

export const dynamic = "force-dynamic";

// Grounded sales assistant: answers ONLY from local CRM data (inventory units,
// past deals, customers). Deterministic retrieval always runs; if ANTHROPIC_API_KEY
// is set, Claude writes a natural answer over the retrieved records. No fabrication.

// Filler + field-name words the user asks ABOUT (not values to match on).
// "color/stock/vin/trim/price" must be here or "stock" matches the status "IN-STOCK".
const STOP = new Set(
  ("the a an is are was were do does did of for me my our we us in on at to with what which when where why" +
    " how many much who whose show find get give tell list about have has had and or vs this that it any all" +
    " stock stk vin color colour trim price priced cost deal deals sell sells sold sale buy buys bought purchase" +
    " vehicle vehicles car cars truck lot unit units inventory have got want need this month" +
    " cheap cheapest expensive priciest best worst lowest highest biggest most least top under over below above" +
    " than around between only available left here there last first recent")
    .split(/\s+/)
);
const CONCEPTS = new Set(["aged", "old", "fresh", "new", "newest"]);

function tokenize(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9-]+/g) || []).filter((t) => t.length > 1 && !STOP.has(t));
}
// match a token against a haystack, tolerating singular/plural (truck(s), bronco(s))
function tokMatch(hay: string, t: string): boolean {
  if (hay.includes(t)) return true;
  if (t.endsWith("s") && hay.includes(t.slice(0, -1))) return true;
  return false;
}

export async function POST(req: NextRequest) {
  const { question = "" } = await req.json().catch(() => ({}));
  const q = String(question).trim();
  if (!q) return NextResponse.json({ answer: "Ask me about a stock #, VIN, color, model, a past deal, or a customer." });

  const all = tokenize(q);
  const concepts = all.filter((t) => CONCEPTS.has(t));
  const tokens = all.filter((t) => !CONCEPTS.has(t)); // real search terms
  const wantAged = concepts.some((c) => c === "aged" || c === "old");
  const wantFresh = concepts.some((c) => c === "fresh" || c === "new" || c === "newest");

  const units = getInventoryUnits().units;
  const deals = getDeals();
  const customers = getCustomers();

  // ALL terms must match (AND), tolerant of plurals; empty terms + a concept still works.
  const matchAll = (hay: string, toks: string[]) => { const h = hay.toLowerCase(); return toks.every((t) => tokMatch(h, t)); };

  const exactStock = units.find((u) => tokens.includes((u.stock || "").toLowerCase()));

  let unitHits = units.filter((u) => {
    if (wantAged && u.age < 120) return false;
    if (wantFresh && u.age > 30) return false;
    if (!tokens.length) return wantAged || wantFresh; // pure "show aged" with no model term
    return matchAll(`${u.stock} ${u.vin} ${u.year} ${u.model} ${u.trim} ${u.ext} ${u.int} ${u.store}`, tokens);
  });
  unitHits = unitHits.sort((a, b) => (a === exactStock ? -1 : b === exactStock ? 1 : 0) || a.age - b.age);

  // ---- past-deal + customer matches (need at least one real term) ----
  const dealHits = tokens.length
    ? deals.filter((d) => matchAll(`${d.date} ${d.customer} ${d.stock} ${d.yr} ${d.make} ${d.model} ${d.store} ${d.nuo}`, tokens))
    : [];
  const custHits = tokens.length
    ? customers.filter((c) => matchAll(`${c.name} ${c.vehicle_interest} ${c.stage} ${c.source}`, tokens))
    : [];

  const fmtUnit = (u: any) =>
    `Stock ${u.stock} — ${u.year} ${u.model}${u.trim ? " " + u.trim : ""}, ${title(u.ext)}${u.int && u.int !== "NaN" ? "/" + title(u.int) : ""}, ${u.price ? money(u.price) : "price n/a"}, ${u.age}d on lot, ${u.status}, VIN ${u.vin}`;
  const fmtDeal = (d: any) =>
    `${d.date} — ${d.customer} bought ${d.yr} ${d.make} ${d.model} (stock ${d.stock}, ${d.store}); front ${money(d.front)}, F&I ${money(d.back)}, total ${money(d.front + d.back)}`;

  // ---- deterministic answer ----
  let lookup = "";
  const topUnits = unitHits.slice(0, 8);
  if (topUnits.length) lookup += `INVENTORY (${unitHits.length} match${unitHits.length === 1 ? "" : "es"}):\n` + topUnits.map(fmtUnit).join("\n") + "\n\n";
  if (dealHits.length) lookup += `PAST DEALS (${dealHits.length}):\n` + dealHits.slice(0, 8).map(fmtDeal).join("\n") + "\n\n";
  if (custHits.length) lookup += `CUSTOMERS (${custHits.length}):\n` + custHits.slice(0, 6).map((c: any) => `${c.name} — ${c.vehicle_interest} (${c.stage})`).join("\n") + "\n\n";
  if (!lookup) lookup = "No matching inventory unit, past deal, or customer found for that.";

  // ---- optional LLM synthesis over the retrieved records ----
  const key = process.env.ANTHROPIC_API_KEY;
  if (key && lookup && !lookup.startsWith("No matching")) {
    try {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: key });
      const model = process.env.OUTREACH_MODEL || "claude-opus-4-8";
      const msg = await client.messages.create({
        model,
        max_tokens: 400,
        system:
          "You are Bailey Covert's sales-desk assistant. Answer ONLY from the records provided — never invent stock numbers, VINs, prices, colors, or gross. Be concise and direct, like a desk manager. If the records don't answer it, say so.",
        messages: [{ role: "user", content: `Question: ${q}\n\nRecords:\n${lookup}` }],
      });
      const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
      return NextResponse.json({ answer: text, source: "ai", units: topUnits });
    } catch {
      /* fall through to lookup */
    }
  }

  return NextResponse.json({ answer: lookup.trim(), source: "lookup", units: topUnits });
}

function title(s: string) {
  if (!s || s === "NaN") return "";
  return s.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
}
