#!/usr/bin/env node
/**
 * set-role.mjs — grant/revoke who can see store financials in COVE.
 *
 *   node scripts/set-role.mjs                      # list everyone's role
 *   node scripts/set-role.mjs <name|slug> manager  # promote: sees all numbers
 *   node scripts/set-role.mjs <name|slug> salesman # demote:  own numbers only
 *
 * Tiers:  admin (you) → everything · manager → all financial numbers/pages ·
 *         salesman → own board + inventory, no store gross / inventory value.
 * Matches by slug or a case-insensitive name substring.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "data", "users.json");
const users = JSON.parse(fs.readFileSync(FILE, "utf8"));

const role = (u) => (u.isAdmin ? "admin" : u.manager ? "manager" : "salesman");
const [who, action] = process.argv.slice(2);

if (!who) {
  for (const u of [...users].sort((a, b) => role(a).localeCompare(role(b)) || a.name.localeCompare(b.name))) {
    console.log(`${role(u).padEnd(9)} ${u.name}  (${u.slug})`);
  }
  console.log(`\n${users.length} users. Usage: node scripts/set-role.mjs "<name|slug>" manager|salesman`);
  process.exit(0);
}

const q = who.toLowerCase();
const matches = users.filter((u) => u.slug === q || u.name.toLowerCase().includes(q));
if (matches.length === 0) { console.error(`No user matches "${who}".`); process.exit(1); }
if (matches.length > 1) {
  console.error(`"${who}" is ambiguous:\n` + matches.map((u) => `  ${u.name} (${u.slug})`).join("\n"));
  process.exit(1);
}
const u = matches[0];
if (u.isAdmin) { console.error(`${u.name} is an admin — leave as-is (admins already see everything).`); process.exit(1); }

if (action === "manager") u.manager = true;
else if (action === "salesman" || action === "rep") delete u.manager;
else { console.error(`Action must be "manager" or "salesman" (got "${action || ""}").`); process.exit(1); }

fs.writeFileSync(FILE, JSON.stringify(users, null, 2) + "\n");
console.log(`✓ ${u.name} is now: ${role(u)}.`);
console.log("Takes effect on their next page load — no restart needed.");
