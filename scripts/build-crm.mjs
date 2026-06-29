#!/usr/bin/env node
/**
 * build-crm.mjs — the ONE place that turns live GMReview leads into the connected
 * customers + pipeline + lead-feed the app shows. Run by the covert-crm-pipeline
 * scheduled task every few minutes (and any time you want a manual refresh).
 *
 * Inputs (data/):
 *   _active-leads.json  = live GMReview scorecard_leads (status=Active) for Bailey, e.g.
 *       [{ customer, source, year, make, model, stock, contacted:"Yes"|"No",
 *          origin:"<ISO>", lastContact:"<ISO|null>" }]
 *   wiki-notes.json     = rich enrichment keyed by normalized name (phone/email/trade/
 *                         personal/notes/next_step/vehicle_interest). Built from the wiki
 *                         by `npm run sync`; optional — leads still work without it.
 *   inventory.json      = current stock (for the "in stock that fits" match).
 *
 * Outputs (kept perfectly in sync with each other):
 *   customers.json      = unified active audience (live leads + wiki enrichment)
 *   pipeline.json       = same people, grouped into kanban stages from their live status
 *   lead-feed.json      = the "needs first contact" subset for the board's Your-new-leads
 *
 * Never fabricates: a field with no source is left null/empty.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(v, null, 2) + "\n");

const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const kebab = (s) => normName(s).replace(/\s+/g, "-");
const dateOnly = (iso) => (iso || "").slice(0, 10);
const daysAgo = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 9999);

// ---- inventory match (same idea as the board's matchInventory) ----
const inv = read("inventory.json", { ford: [], chevy: [] });
const invAll = [
  ...(inv.ford || []).map((m) => ({ ...m, store: "Ford" })),
  ...(inv.chevy || []).map((m) => ({ ...m, store: "Chevy" })),
];
function matchStock(make, model) {
  const v = `${make || ""} ${model || ""}`.toLowerCase();
  const hit = invAll.find((m) => v.includes(m.model.toLowerCase()) ||
    m.model.toLowerCase().split(/\s+/).some((t) => t.length > 2 && v.includes(t)));
  return hit ? `${hit.units} ${hit.model} in stock (~$${Math.round(hit.avgMsrp / 1000)}k)` : "no exact match — dealer-trade option";
}

// ---- load live leads + dedupe by customer (keep most-recent activity) ----
const raw = read("_active-leads.json", []);
const wiki = read("wiki-notes.json", {});
const byName = new Map();
for (const l of raw) {
  if (!l.customer) continue;
  const key = normName(l.customer);
  const recency = l.lastContact || l.origin || "";
  const prev = byName.get(key);
  if (!prev || recency > (prev._recency || "")) byName.set(key, { ...l, _recency: recency });
}
const leads = [...byName.values()];

// ---- stage logic from live status ----
// hot      = uncontacted & fresh (<=21d) → needs first touch NOW
// working  = contacted & active
// warm     = uncontacted & aging (>21d) → nurture / likely cold
function stageOf(l) {
  const contacted = (l.contacted || "").toLowerCase() === "yes";
  if (contacted) return "working";
  return daysAgo(l.origin) <= 21 ? "hot" : "warm";
}

const usedSlugs = new Set();
function slugFor(name) {
  const w = wiki[normName(name)];
  let s = w?.slug || ("lead-" + kebab(name));
  while (usedSlugs.has(s)) s += "-2";
  usedSlugs.add(s);
  return s;
}

// ---- build unified customer records ----
const customers = leads.map((l) => {
  const w = wiki[normName(l.customer)] || {};
  const vehicle = w.vehicle_interest || [l.year, l.make, l.model].filter((x) => x && x !== "Make Unknown" && x !== "M").join(" ").trim();
  const stage = stageOf(l);
  return {
    slug: slugFor(l.customer),
    name: l.customer,
    phone: w.phone || null,
    email: w.email || null,
    vehicle_interest: vehicle || "vehicle TBD",
    trade: w.trade || null,
    stage: stage === "hot" ? "New lead" : stage === "working" ? "Working" : "Aging",
    status: "active",
    last_touch: dateOnly(l.lastContact || l.origin),
    next_step: w.next_step || (stage === "hot" ? "Make first contact — call/text today" : stage === "warm" ? "Re-engage or mark dead" : "Advance the deal"),
    personal: w.personal || "",
    source: l.source || "CRM",
    notes: w.notes || `${l.source || "CRM"} lead${l.stock ? ` · stock ${l.stock}` : ""}. ${matchStock(l.make, l.model)}.`,
    hot: stage === "hot",
    _stage: stage, // internal, for pipeline grouping
  };
});

// Union in the rapport-rich wiki / iMessage customers (walk-ins, referrals, texts)
// that aren't web leads in scorecard_leads — so nothing curated is ever dropped.
const wikiFull = read("wiki-customers.json", []);
const haveNames = new Set(customers.map((c) => normName(c.name)));
for (const wc of wikiFull) {
  if (wc.status === "closed") continue;
  if (haveNames.has(normName(wc.name))) continue;
  haveNames.add(normName(wc.name));
  const isHot = !!wc.hot || /hot/i.test(wc.stage || "");
  customers.push({ ...wc, _stage: isHot ? "hot" : "working" });
}

// Union in every direct channel — iMessage, Gmail, VinSolutions (from the *-ingest scripts).
// These can NEVER be dropped; they land in "needs first contact" with their captured interest.
const channelLeads = [
  ...read("imessage-leads.json", []),
  ...read("gmail-leads.json", []),
  ...read("gmail-csv-leads.json", []),
  ...read("vinsolutions-leads.json", []),
];
for (const tl of channelLeads) {
  const key = normName(tl.name || "");
  if (key && haveNames.has(key)) {
    // already a known customer — mark hot and backfill any contact info we now have
    const c = customers.find((x) => normName(x.name) === key);
    if (c) { c.hot = true; c._stage = "hot"; if (!c.phone && tl.phone) c.phone = tl.phone; if (!c.email && tl.email) c.email = tl.email; }
    continue;
  }
  if (key) haveNames.add(key);
  const ch = tl.channel || "iMessage";
  customers.push({
    slug: tl.slug, name: tl.name, phone: tl.phone || null, email: tl.email || null,
    vehicle_interest: tl.vehicle || "vehicle TBD", trade: null,
    stage: ch === "VinSolutions" ? "VinSolutions lead" : ch === "Gmail" ? "New email lead" : "New text lead",
    status: "active", last_touch: dateOnly(tl.at),
    next_step: ch === "Gmail" ? "Reply to their email — make first contact" : ch === "VinSolutions" ? "Work this VinSolutions lead — first contact" : "Reply to their text — make first contact",
    personal: "", source: tl.source || ch, notes: tl.lastMsg || "", hot: true, _stage: "hot",
  });
}

// ---- apply live CONTEXT overrides (from enrich-context.mjs) ----
// When a customer changes their mind in a text ("actually, the Tahoe"), COVE wrote
// their CURRENT vehicle interest here. It wins over the first-captured interest, so
// the profile, the board, and the inventory match all follow the change.
const ctxOverrides = read("context-overrides.json", {});
for (const c of customers) {
  const ov = ctxOverrides[normName(c.name)];
  if (ov && ov.vehicle_interest) {
    if (ov.changed) { c.hot = true; c._stage = "hot"; } // a fresh switch is worth surfacing
    c.vehicle_interest = ov.vehicle_interest;
    if (ov.note) c.notes = `↻ ${ov.note}` + (c.notes ? `\n${c.notes}` : "");
  }
}

// ---- drop leads Bailey clicked out, and anyone already SOLD ----
// overrides: "remove" = manual click-out, "keep" = never auto-remove (restore beats a sold match).
// Sold = matched against the FULL sold history (sold.json — 400 days, full customer names) so a lead
// that's actually an already-sold customer (this month OR a prior one) falls off the active board.
// Match precisely: exact full name, OR last-name + first-initial (catches "John Smith" ⇄ "J Smith"
// without false-matching a different "Smith"). Records what + why into removed-leads.json (restorable).
const overrides = read("lead-overrides.json", {});
const soldDeals = read("sold.json", { deals: [] }).deals || [];
const lastNameOf = (k) => { const t = k.split(" ").filter(Boolean); return t[t.length - 1] || ""; };
const firstInitialOf = (k) => { const t = k.split(" ").filter(Boolean); return (t[0] || "")[0] || ""; };
const soldFull = new Set(), soldLastInitial = new Set();
const soldVehicleByName = {};
for (const d of soldDeals) {
  const n = normName(d.customer || ""); if (!n) continue;
  soldFull.add(n);
  const ln = lastNameOf(n), fi = firstInitialOf(n);
  if (ln && fi) soldLastInitial.add(ln + "|" + fi);
  if (!soldVehicleByName[n]) soldVehicleByName[n] = [d.year, d.make, d.model].filter(Boolean).join(" ").trim();
}
const isSold = (k) => { const ln = lastNameOf(k), fi = firstInitialOf(k); return soldFull.has(k) || (!!ln && !!fi && soldLastInitial.has(ln + "|" + fi)); };
const removedLog = [];
for (let i = customers.length - 1; i >= 0; i--) {
  const c = customers[i];
  const k = normName(c.name);
  if (overrides[k] === "keep") continue;                 // restored — never auto-remove
  if (overrides[k] === "remove") { removedLog.push({ name: c.name, reason: "clicked out" }); customers.splice(i, 1); continue; }
  if (isSold(k)) { removedLog.push({ name: c.name, reason: "sold", vehicle: soldVehicleByName[k] || "" }); customers.splice(i, 1); }
}
const nDropped = removedLog.length;
write("removed-leads.json", removedLog);

// ---- pipeline columns (same people, grouped by live stage) ----
const COLS = [
  { key: "hot", title: "Needs first contact", stages: ["hot"] },
  { key: "working", title: "Working", stages: ["working"] },
  { key: "warm", title: "Aging — nurture", stages: ["warm"] },
];
const columns = COLS.map((c) => ({
  key: c.key,
  title: c.title,
  leads: customers
    .filter((cu) => c.stages.includes(cu._stage))
    .sort((a, b) => (b.last_touch || "").localeCompare(a.last_touch || ""))
    .map((cu) => ({ name: cu.name, vehicle: cu.vehicle_interest, note: cu.next_step, phone: cu.phone || "" })),
}));

const nNew = columns.find((c) => c.key === "hot")?.leads.length || 0;
const nWork = columns.find((c) => c.key === "working")?.leads.length || 0;
const pipeline = {
  last_refresh: new Date().toISOString(),  // full timestamp so health grades by the real refresh time
  source: "GMReview scorecard_leads (live, status=Active)",
  standing: `${customers.length} active leads — ${nNew} need first contact, ${nWork} working`,
  columns,
};

// ---- lead-feed = the board's "Your new leads" = the hot column, newest first ----
const feedAll = read("lead-feed.json", {});
feedAll["bailey-covert"] = customers
  .filter((cu) => cu._stage === "hot")
  .sort((a, b) => (b.last_touch || "").localeCompare(a.last_touch || ""))
  .slice(0, 30)
  .map((cu) => ({
    at: cu.last_touch,
    source: cu.source,
    customer: cu.name,
    vehicle: cu.vehicle_interest,
    match: matchStockFor(cu),
    urgent: true,
  }));
function matchStockFor(cu) {
  // re-derive from vehicle_interest text
  const hit = invAll.find((m) => cu.vehicle_interest.toLowerCase().includes(m.model.toLowerCase()));
  return hit ? `${hit.units} ${hit.model} in stock (~$${Math.round(hit.avgMsrp / 1000)}k)` : "no exact match — dealer-trade option";
}

// strip internal field before writing
const cleanCustomers = customers.map(({ _stage, ...c }) => c);
write("customers.json", cleanCustomers);
write("pipeline.json", pipeline);
write("lead-feed.json", feedAll);

console.log(`build-crm: ${cleanCustomers.length} customers · pipeline ${nNew} new / ${nWork} working / ${customers.length - nNew - nWork} aging · dropped ${nDropped} (sold/clicked-out) · feed ${feedAll["bailey-covert"].length}`);
