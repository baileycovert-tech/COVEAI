#!/usr/bin/env node
/**
 * build-contacts.mjs — index Bailey's ~35k contacts into data/contacts.db (SQLite)
 * so the CRM can fill in a phone/email it doesn't have. Read-only over the source CSVs.
 *
 * Sources (Covert Sales Assistant / sources/customers):
 *   customer_list_ford_hutto_*.csv  (NAME last-first, CELL, EMAIL) — the big dealership list
 *   current-network.csv             (Name, Email, Phone)
 *   current-iphone-contacts.csv     (Name, Phones, Emails)
 * Matching key = normalized, order-independent name tokens, so "ZUBER ANTHONY" == "Anthony Zuber".
 */
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.resolve(ROOT, "..", "sources", "customers");
const DB = path.join(ROOT, "data", "contacts.db");

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "md", "dds"]);
const nameKey = (s) =>
  (s || "").toLowerCase().replace(/[^a-z, ]/g, " ").replace(/,/g, " ")
    .split(/\s+/).filter((t) => t.length > 1 && !SUFFIX.has(t)).sort().join(" ").trim();
const phone10 = (s) => { const d = (String(s || "").match(/\d/g) || []).join(""); return d.length >= 10 ? d.slice(-10) : ""; };
const fmtPhone = (d) => d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : "";

// minimal CSV line parser (handles quoted fields with commas)
function parseLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
  }
  out.push(cur); return out;
}

const db = new Database(DB);
db.pragma("journal_mode = WAL");
db.exec("DROP TABLE IF EXISTS contacts; CREATE TABLE contacts(key TEXT, name TEXT, phone TEXT, phone10 TEXT, email TEXT, source TEXT);");
const ins = db.prepare("INSERT INTO contacts(key,name,phone,phone10,email,source) VALUES(?,?,?,?,?,?)");

let n = 0;
const add = (name, phoneRaw, email, source) => {
  const key = nameKey(name);
  if (!key) return;
  const p10 = phone10(phoneRaw);
  if (!p10 && !(email && email.includes("@"))) return;
  ins.run(key, (name || "").trim(), p10 ? fmtPhone(p10) : "", p10, (email || "").trim(), source);
  n++;
};

function load(file, fn) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) { console.log("skip (missing):", file); return; }
  const lines = fs.readFileSync(p, "utf8").split("\n");
  const hdr = parseLine(lines[0]);
  const txn = db.transaction(() => { for (let i = 1; i < lines.length; i++) { if (lines[i].trim()) fn(parseLine(lines[i]), hdr); } });
  txn();
  console.log("loaded", file);
}

// big dealership list: NAME(4) CELL(6) EMAIL(7)
load("customer_list_ford_hutto_2026-05-11.csv", (c) => add(c[4], c[6], c[7], "dealership"));
// network: Name, Email, Phone
load("current-network.csv", (c, h) => add(c[h.indexOf("Name")], c[h.indexOf("Phone")], c[h.indexOf("Email")], "network"));
// iphone: Name, ... Phones, Emails
load("current-iphone-contacts.csv", (c, h) => add(c[h.indexOf("Name")], c[h.indexOf("Phones")], c[h.indexOf("Emails")], "iphone"));

db.exec("CREATE INDEX idx_key ON contacts(key); CREATE INDEX idx_p10 ON contacts(phone10);");
const stats = db.prepare("SELECT COUNT(*) c, COUNT(DISTINCT key) k, SUM(CASE WHEN phone10!='' THEN 1 ELSE 0 END) p FROM contacts").get();
db.close();
console.log(`contacts.db built: ${stats.c} rows, ${stats.k} unique names, ${stats.p} with phone`);
