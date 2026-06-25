#!/usr/bin/env node
/**
 * apply-arrivals.mjs — when a vehicle arrives that matches an OPEN lead, notify the rep.
 *
 * Input: data/_inv-current.json = [ { stock, year, make, model, store } ]  (all current units)
 * - Diffs against data/.inv-seen.json to find NEW arrivals (first run just seeds, no alerts).
 * - Matches each arrival's model against open leads' vehicle-of-interest (lead-feed.json +
 *   manual-leads.json), per owning rep.
 * - Appends an "arrival match" to that rep's lead-feed and prints push targets.
 * - Dedupes arrival×lead pairs via data/.arrival-seen.json.
 *
 * Prints: { "push":[{slug,title,body}], "arrivals":N, "matches":M }
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(v, null, 2) + "\n");

const current = read("_inv-current.json", []);
if (!current.length) { console.log(JSON.stringify({ push: [], arrivals: 0, matches: 0, note: "no inventory provided" })); process.exit(0); }

const seen = new Set(read(".inv-seen.json", []));
const firstRun = seen.size === 0;
const arrivals = current.filter((u) => u.stock && !seen.has(u.stock));
for (const u of current) if (u.stock) seen.add(u.stock);
write(".inv-seen.json", [...seen].slice(-5000));

// First run: seed only, never blast alerts for the whole existing lot.
if (firstRun) { console.log(JSON.stringify({ push: [], arrivals: arrivals.length, matches: 0, note: "seeded inventory baseline" })); process.exit(0); }

// Build open-lead list: {slug, customer, voi}
const feed = read("lead-feed.json", {});
const openLeads = [];
for (const slug of Object.keys(feed)) for (const it of feed[slug] || []) if (it.vehicle) openLeads.push({ slug, customer: it.customer, voi: it.vehicle });
for (const m of read("manual-leads.json", [])) if (m.vehicle && m.rep) openLeads.push({ slug: m.rep, customer: m.name, voi: m.vehicle });

const arrSeen = new Set(read(".arrival-seen.json", []));
const matchModel = (voi, u) => {
  const v = (voi || "").toLowerCase();
  const mk = (u.model || "").toLowerCase();
  if (!v || !mk) return false;
  return v.includes(mk) || mk.split(/\s+/).some((t) => t.length > 2 && v.includes(t));
};

const push = [];
let matches = 0;
const now = new Date().toISOString().replace(/\.\d+Z$/, "");
for (const a of arrivals) {
  for (const lead of openLeads) {
    if (!matchModel(lead.voi, a)) continue;
    const key = `${a.stock}|${lead.slug}|${lead.customer}`;
    if (arrSeen.has(key)) continue;
    arrSeen.add(key);
    matches++;
    const veh = [a.year, a.make, a.model].filter(Boolean).join(" ");
    feed[lead.slug] = [{ at: now, source: "Inventory arrival", customer: lead.customer, vehicle: lead.voi, match: `🚙 Just landed: ${veh} (stock ${a.stock}) — matches ${lead.customer}`, urgent: true, arrival: true }, ...(feed[lead.slug] || [])].slice(0, 30);
    push.push({ slug: lead.slug, title: "🚙 Match just arrived", body: `${veh} (stock ${a.stock}) just landed — matches ${lead.customer}'s interest in ${lead.voi}.` });
  }
}
write("lead-feed.json", feed);
write(".arrival-seen.json", [...arrSeen].slice(-3000));
console.log(JSON.stringify({ push, arrivals: arrivals.length, matches }));
