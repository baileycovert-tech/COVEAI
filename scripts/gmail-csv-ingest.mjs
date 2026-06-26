#!/usr/bin/env node
/**
 * gmail-csv-ingest.mjs — parse lead CSVs into leads, losslessly.
 *
 * Bailey's bulk email leads don't arrive in the email BODY — they come as CSV attachments
 * ("Daily lead dump" from motosnap.com, and similar vendor exports). This consumes any CSV
 * dropped into data/_gmail-csv/*.csv (the producer — a session with Gmail-attachment access —
 * downloads them there) and turns each row into a lead, mapping columns by header keyword so it
 * works across vendor formats without hard-coding column positions.
 *
 * Dedup by a per-row hash in poll.db (seen key "csv:<hash>"), so re-dropping the same dump never
 * double-creates. Writes data/gmail-csv-leads.json (build-crm unions it) and rebuilds.
 */
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { phone10, kebab, titleCase } from "./lib-leads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const DROP = path.join(DATA, "_gmail-csv");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), "gmail-csv-ingest:", ...a);

// --- tiny RFC-4180-ish CSV parser (handles quotes, commas, newlines in quotes) ---
function parseCSV(text) {
  const rows = []; let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

// map a header name to a canonical field by keyword
function colKind(h) {
  const s = h.toLowerCase().replace(/[^a-z]/g, "");
  if (/^(firstname|fname|first|givenname)$/.test(s)) return "first";
  if (/^(lastname|lname|last|surname)$/.test(s)) return "last";
  if (/customer|fullname|leadname|^name$|contactname/.test(s)) return "name";
  if (/cell|mobile|phone|tel/.test(s)) return "phone";
  if (/email|mail/.test(s)) return "email";
  if (/vehicleofinterest|vehicle|model|interest|voi|yearmakemodel/.test(s)) return "vehicle";
  if (/stock/.test(s)) return "stock";
  if (/source|leadsource|provider/.test(s)) return "source";
  if (/date|received|created/.test(s)) return "date";
  return null;
}

function rowToLead(headerKinds, cells, fileLabel) {
  const g = (kind) => { const i = headerKinds.indexOf(kind); return i >= 0 ? (cells[i] || "").trim() : ""; };
  let name = g("name");
  if (!name) name = [g("first"), g("last")].filter(Boolean).join(" ").trim();
  const phoneRaw = g("phone"); const email = g("email").toLowerCase();
  if (!name && !phoneRaw && !email) return null;
  const phone = phoneRaw ? phone10(phoneRaw) : null;
  return {
    name: titleCase(name) || (email ? email.split("@")[0] : "Lead " + (phone ? phone.slice(-4) : "")),
    phone: phone && phone.length === 10 ? phone : null,
    email: email || null,
    vehicle: g("vehicle"),
    stock: g("stock") || null,
    source: g("source") || fileLabel || "Lead CSV",
    date: g("date"),
  };
}

if (!fs.existsSync(DROP)) { log(`no drop folder ${DROP} — nothing to do (producer hasn't downloaded any CSVs)`); process.exit(0); }
const files = fs.readdirSync(DROP).filter((f) => /\.csv$/i.test(f));
if (!files.length) { log("no CSVs in drop folder"); process.exit(0); }

const db = new Database(path.join(DATA, "poll.db"));
db.exec("CREATE TABLE IF NOT EXISTS seen(key TEXT PRIMARY KEY, ts TEXT);");
const isSeen = db.prepare("SELECT 1 FROM seen WHERE key=?");
const markSeen = db.prepare("INSERT OR IGNORE INTO seen(key,ts) VALUES(?,?)");

const leads = read("gmail-csv-leads.json", []);
const leadByKey = new Map(leads.map((l) => [l.email || l.phone || kebab(l.name), l]));
const nowISO = new Date().toISOString();
let nNew = 0, nDup = 0, nFiles = 0;

for (const file of files) {
  const text = fs.readFileSync(path.join(DROP, file), "utf8");
  const rows = parseCSV(text);
  if (rows.length < 2) continue;
  nFiles++;
  const headerKinds = rows[0].map(colKind);
  const fileLabel = /motosnap|105|lead dump/i.test(file) ? "Lead CSV" : file.replace(/\.csv$/i, "");
  for (const cells of rows.slice(1)) {
    const lead = rowToLead(headerKinds, cells, fileLabel);
    if (!lead) continue;
    const hash = crypto.createHash("sha1").update((lead.email || "") + "|" + (lead.phone || "") + "|" + lead.name.toLowerCase() + "|" + lead.vehicle.toLowerCase()).digest("hex").slice(0, 16);
    const key = "csv:" + hash;
    if (isSeen.get(key)) { nDup++; continue; }
    markSeen.run(key, nowISO);
    const lk = lead.email || lead.phone || kebab(lead.name);
    leadByKey.set(lk, {
      slug: "gmail-" + (kebab(lead.name) || lk), name: lead.name, phone: lead.phone, email: lead.email,
      vehicle: lead.vehicle, source: lead.source, stock: lead.stock,
      at: lead.date || nowISO, lastMsg: "", hot: true, channel: "Gmail",
    });
    nNew++;
  }
}

const finalLeads = [...leadByKey.values()].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
write("gmail-csv-leads.json", finalLeads);
write("gmail-csv-status.json", { at: nowISO, files: nFiles, newLeads: nNew, dupes: nDup, total: finalLeads.length });
db.close();
try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-crm.mjs")], { encoding: "utf8", stdio: "inherit" }); } catch (e) { log("build-crm err", e.message); }
log(JSON.stringify({ files: nFiles, newLeads: nNew, dupes: nDup }));
