#!/usr/bin/env node
/**
 * apply-leads.mjs — route new CRM leads to each rep's in-app feed + tell the task who to push.
 *
 * Input: data/_leads-raw.json = [ { lead_id, rep, customer, lead_source, inventory_type,
 *                                   year, make, model, origin } ]   (current store leads, recent)
 * - Maps rep name -> login slug (same alias logic as gen-reps).
 * - Dedupes against data/.lead-seen.json (lead_id already processed).
 * - Matches each lead's model to data/inventory.json.
 * - Appends to data/lead-feed.json (keyed by slug, newest first, 30 per rep).
 * - Prints JSON: { push: [ {slug, title, body} ], newCount }  so the task can web-push each rep.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(v, null, 2) + "\n");

const ALIASES = {
  "jake ward": "jacob dwight ward", "junior gobert": "felician gobert jr",
  "felician sr gobert": "felician joseph gobert iii", "kris concelman": "zenichi concelman",
  "mike williams": "michael williams", "tony favors": "anthony jemalle favors",
  "anthony favors": "anthony jemalle favors", "craig martinez": "craig martin martinez",
  "ryan gill": "ryan matthew gill", "jenna gill": "jenna marie gill", "brian brown": "brian n brown",
  "larry williams": "larry darnell williams iii", "ricardo ruiz": "ricardo luis ruiz quinones",
  "chris howe": "christopher howe", "chris huff": "christopher corey huff", "ian day": "phillip ian day",
  "brandon lopez": "phillip brandon lopez", "travis etie": "travis m etie",
  "jonathan alcala": "jonathan evaristo alcala", "david ozornea": "david enrique ozornea",
  "kwami wilborn": "kwami na'jae wilborn", "miguel castro": "miguel castro vargas",
};
const norm = (s) => {
  let k = (s || "").toLowerCase().replace(/\bch\b/g, "").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
  return ALIASES[k.replace(/'/g, "")] || ALIASES[k] || k;
};
const userKey = (n) => (n || "").toLowerCase().replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();

const users = read("users.json", []);
const slugFor = (rep) => {
  const k = norm(rep);
  const u = users.find((x) => userKey(x.name) === k) || users.find((x) => userKey(x.name) === (ALIASES[k] || ""));
  return u ? u.slug : null;
};

const inv = read("inventory.json", { ford: [], chevy: [] });
const invAll = [...(inv.ford || []).map((m) => ({ ...m, store: "Ford" })), ...(inv.chevy || []).map((m) => ({ ...m, store: "Chevy" }))];
function match(make, model) {
  const v = `${make || ""} ${model || ""}`.toLowerCase();
  const hit = invAll.find((m) => v.includes(m.model.toLowerCase()) || m.model.toLowerCase().split(/\s+/).some((t) => t.length > 2 && v.includes(t)));
  return hit ? `${hit.units} ${hit.model} in stock (~$${Math.round(hit.avgMsrp / 1000)}k)` : "no exact match — dealer-trade option";
}

const raw = read("_leads-raw.json", []);
const seen = new Set(read(".lead-seen.json", []));
const feed = read("lead-feed.json", {});
const push = [];
let newCount = 0;

for (const l of raw) {
  if (l.lead_id != null && seen.has(l.lead_id)) continue;
  if (l.lead_id != null) seen.add(l.lead_id);
  const slug = slugFor(l.rep);
  if (!slug) continue; // rep has no login account
  const veh = [l.year, l.make, l.model].filter(Boolean).join(" ");
  const m = match(l.make, l.model);
  const item = {
    at: l.origin || new Date().toISOString().replace(/\.\d+Z$/, ""),
    source: l.lead_source || "CRM",
    customer: l.customer || "New lead",
    vehicle: veh,
    match: m,
    urgent: true,
  };
  feed[slug] = [item, ...(feed[slug] || [])].slice(0, 30);
  push.push({ slug, title: "🚗 New lead", body: `${item.customer} — ${veh || "vehicle"} (${item.source}). ${m}` });
  newCount++;
}

write("lead-feed.json", feed);
write(".lead-seen.json", [...seen].slice(-1000));
try { fs.unlinkSync(path.join(DIR, "_leads-raw.json")); } catch {}
console.log(JSON.stringify({ push, newCount }));
