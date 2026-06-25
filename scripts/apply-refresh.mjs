#!/usr/bin/env node
/**
 * apply-refresh.mjs — deterministic writer for the live refresh agent.
 *
 * The scheduled "covert-crm-refresh" agent gathers live data each run (sold deals
 * from GMReview + the Drive month log, plus new Gmail/Messages signals), drops it
 * into data/_incoming.json, then runs this script. The script — not the agent —
 * does all the math and file writing, so every refresh is consistent and safe.
 *
 * data/_incoming.json shape (all keys optional):
 * {
 *   "dataThrough": "2026-06-24",
 *   "monthLabel": "June 2026",
 *   "deals": [ {date,nuo,yr,make,model,customer,stock,front,back,store}, ... ],  // current month, full replace
 *   "signals": [ {at,source,who,summary,urgent}, ... ]                            // new comms to merge
 * }
 *
 * Usage:  node scripts/apply-refresh.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DIR, f), JSON.stringify(v, null, 2) + "\n");
const nowISO = () => new Date().toISOString().replace(/\.\d+Z$/, "");

const incoming = read("_incoming.json", null);
if (!incoming) { console.error("no data/_incoming.json — nothing to apply"); process.exit(1); }

const monthOf = (d) => (d || "").slice(0, 7);
const log = [];

// 1) Deals — full replace of current-month deal log (sorted newest first).
if (Array.isArray(incoming.deals) && incoming.deals.length) {
  // Carry forward known gross by stock: the frequent CRM pull often has 0 gross
  // (fills in later); the Drive-log reconcile has the real numbers. Never wipe them.
  const prior = {};
  for (const d of read("deals.json", [])) prior[d.stock] = d;
  const deals = [...incoming.deals]
    .map((d) => {
      let front = Number(d.front) || 0, back = Number(d.back) || 0;
      const p = prior[d.stock];
      if (front === 0 && back === 0 && p && (p.front || p.back)) { front = p.front; back = p.back; }
      return {
        date: d.date, nuo: (d.nuo || "NEW").toUpperCase(), yr: String(d.yr || ""),
        make: d.make || "", model: d.model || "", customer: d.customer || (p && p.customer) || "—",
        stock: d.stock || "", front, back, store: d.store || "Ford",
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  write("deals.json", deals);
  log.push(`deals.json: ${deals.length} rows`);

  // 2) Metrics — recompute the current month from the deal list.
  const ym = monthOf(deals[0].date);
  const label = incoming.monthLabel ? incoming.monthLabel.split(" ")[0].slice(0, 3) : ym;
  const agg = { newUnits: 0, usedUnits: 0, newFront: 0, newBack: 0, usedFront: 0, usedBack: 0 };
  for (const d of deals) {
    const used = d.nuo === "USED";
    agg[used ? "usedUnits" : "newUnits"]++;
    agg[used ? "usedFront" : "newFront"] += d.front;
    agg[used ? "usedBack" : "newBack"] += d.back;
  }
  const metrics = read("metrics.json", { months: [] });
  const entry = { month: ym, label, ...agg };
  const i = metrics.months.findIndex((m) => m.month === ym);
  if (i >= 0) metrics.months[i] = entry; else metrics.months.push(entry);
  metrics.months.sort((a, b) => (a.month < b.month ? -1 : 1));
  write("metrics.json", metrics);
  log.push(`metrics.json: ${ym} = ${agg.newUnits + agg.usedUnits} units, $${Math.round(agg.newFront + agg.newBack + agg.usedFront + agg.usedBack).toLocaleString()} gross`);
}

// 3) Signals — merge new Gmail/Messages items, newest first, keep 60, dedup.
if (Array.isArray(incoming.signals) && incoming.signals.length) {
  const existing = read("signals.json", []);
  const key = (s) => `${s.at}|${s.who}|${(s.summary || "").slice(0, 40)}`;
  const seen = new Set(existing.map(key));
  const merged = [...incoming.signals.filter((s) => !seen.has(key(s))), ...existing]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 60);
  write("signals.json", merged);
  log.push(`signals.json: +${merged.length - existing.length} new (${merged.length} total)`);
}

// 4) Profile — stamp sync time + data-through.
const profile = read("profile.json", {});
profile.lastSync = nowISO();
if (incoming.dataThrough) profile.dataThrough = incoming.dataThrough;
if (incoming.monthLabel) profile.currentMonthLabel = incoming.monthLabel;
write("profile.json", profile);
log.push(`profile.lastSync = ${profile.lastSync}`);

// Clear the inbox so a failed next run can't re-apply stale data.
try { fs.unlinkSync(path.join(DIR, "_incoming.json")); } catch {}

console.log("✓ refresh applied:\n  " + log.join("\n  "));
