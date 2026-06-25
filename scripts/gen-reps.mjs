#!/usr/bin/env node
/**
 * gen-reps.mjs — builds data/reps.json: per-rep current-month board + group leaderboard.
 *
 * Source: GMReview scorecard_sales grouped by sales_representative (current month).
 * scorecard lists reps under multiple variants (a " CH" Chevy-store suffix, plus
 * nicknames), so we merge variants and map each to a login slug where possible.
 *
 * The scheduled sold task overwrites RAW below by writing data/_reps-raw.json
 * (array of {rep, units, new_u, used_u, gross}) then running this script.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { return fb; } };

// Seed snapshot (June 2026, pulled 2026-06-24). Overwritten by _reps-raw.json when present.
const SEED = [
["Gessica Brown",10,7,3,23481.85],["Jake Ward",10,7,3,-1321.35],["Craig Martinez",9,7,2,0],
["Riley Cantu",9,4,5,33689.71],["Bailey Covert",8,5,3,-604.93],["Ryan Gill",8,2,6,9583.71],
["Jordan Harris",7,4,3,6332],["Ricardo Ruiz",7,0,7,18992.79],["Addison Klepper",7,3,4,0],
["Larry Williams",7,2,5,11906.49],["Travis Etie",7,5,2,9939.13],["Chris Howe",7,3,4,3041.6],
["Clay Grant CH",6,2,4,3261.35],["Brian Brown CH",6,5,1,10700.08],["Junior Gobert",6,3,3,-7568.7],
["Craig Martinez CH",6,4,2,8925.23],["Anthony Favors CH",6,5,1,7749.31],["Deontae Cobbs",6,3,3,14356.98],
["Clay Grant",6,2,4,6406.4],["Brandon Lopez",5,1,4,2925.2],["Kris Concelman",5,1,4,6124.42],
["Felician (SR) Gobert",5,2,3,12226],["Todd Patmon",5,1,4,0],["Ryan Richardson",5,3,2,26422.96],
["Ryan Stathos CH",4,3,1,14204.85],["AJ Reese",4,1,3,225.66],["Mike Williams",4,3,1,21404.32],
["Brian Brown",4,3,1,0],["Jonathan Alcala CH",3,3,0,7492.02],["Kwami Wilborn ch",3,3,0,2582.91],
["Jonathan Alcala",3,1,2,0],["Devin HUERTA CH",3,1,2,5579.39],["Bailey Covert CH",3,2,1,0],
["Cameron Caldwell",3,3,0,3678.53],["ANTHONY REESE CH",3,3,0,16194.79],["Ricardo Ruiz CH",3,2,1,9463.97],
["Mike Williams CH",3,1,2,2651.15],["David Ozornea CH",2,2,0,4365.1],["Kwami Wilborn",2,0,2,0],
["Rain Chavez CH",2,2,0,0],["Oscar Castillo",2,1,1,6179.91],["Chris Huff CH",2,0,2,273.97],
["Adrian Campos Vega",2,0,2,0],["Ryan Richardson CH",2,1,1,3237.9],["Miguel Castro",2,0,2,0],
["Sequel Rutherford",2,0,2,4108.88],["Jesus Besonias CH",2,0,2,3906.45],["Jenna Gill CH",2,2,0,881.29],
["JR Woodman CH",2,0,2,-1842.84],["Tony Favors",2,1,1,0],["Benjamin Alexander",2,1,1,0],
["Ryan Stathos",2,1,1,-5718.72],["Dexter Kellough",2,0,2,-2657.1],["Angel Leal CH",2,2,0,-2904.05],
["Chris Huff",1,0,1,9513.79],["Jesus Besonias",1,0,1,17274.38],["Rain Chavez",1,1,0,3135.24],
["Garret Boyd",1,1,0,8642.23],["Elijah Jackson CH",1,1,0,1585.75],["Christian Arceneaux",1,1,0,-2407.69],
["Miguel Castro CH",1,0,1,3024.84],["Ian Day CH",1,1,0,-1004.31],
];

const RAW = read("_reps-raw.json", null);
const rows = RAW ? RAW.map((r) => [r.rep, r.units, r.new_u, r.used_u, Number(r.gross) || 0]) : SEED;

// Normalize a scorecard rep name → a comparable key. Strip the " CH"/" ch" store suffix.
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
  let k = s.toLowerCase().replace(/\bch\b/g, "").replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
  return ALIASES[k.replace(/'/g, "")] || ALIASES[k] || k;
};

// Merge variants by normalized name.
const merged = {};
for (const [rep, u, nu, uu, g] of rows) {
  const k = norm(rep);
  if (!merged[k]) merged[k] = { name: rep.replace(/\s+CH$/i, "").replace(/\s+ch$/, "").trim(), units: 0, newU: 0, usedU: 0, gross: 0 };
  merged[k].units += u; merged[k].newU += nu; merged[k].usedU += uu; merged[k].gross += g;
}

// Map to login slugs.
const users = read("users.json", []);
const userKey = (n) => n.toLowerCase().replace(/[^a-z0-9' ]/g, "").replace(/\s+/g, " ").trim();
const bySlug = {};
for (const u of users) {
  const k = userKey(u.name);
  const m = merged[k] || merged[ALIASES[k] || ""] ||
    Object.values(merged).find((x) => userKey(x.name) === k);
  if (m) bySlug[u.slug] = { units: m.units, newU: m.newU, usedU: m.usedU, gross: Math.round(m.gross) };
}

// Group leaderboard (all reps, by gross), with rank.
const leaderboard = Object.values(merged)
  .filter((m) => m.units > 0)
  .sort((a, b) => b.gross - a.gross)
  .map((m, i) => ({ rank: i + 1, name: m.name, units: m.units, gross: Math.round(m.gross) }));

const out = {
  asOf: new Date().toISOString().slice(0, 10),
  month: "June 2026",
  bySlug,
  leaderboard,
};
fs.writeFileSync(path.join(DIR, "reps.json"), JSON.stringify(out, null, 2) + "\n");
try { fs.unlinkSync(path.join(DIR, "_reps-raw.json")); } catch {}
console.log(`✓ reps.json — ${Object.keys(bySlug).length} reps matched to logins, ${leaderboard.length} on leaderboard`);
