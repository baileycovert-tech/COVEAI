#!/usr/bin/env node
/**
 * sync-contacts.mjs — keep the COVE contact index fresh from the Mac's Contacts (address book).
 *
 * Reads the macOS AddressBook SQLite stores (read-only) — every source/account — and upserts the
 * people + phones + emails into data/contacts.db (source = "iPhone (synced)"). New contacts Bailey
 * saves on his phone show up in COVE search after the next run. Idempotent: it replaces only the
 * previously-synced rows, leaving the dealership CSV-imported contacts intact.
 *
 * Needs Full Disk Access on the node binary (the AddressBook stores are TCC-protected); the launchd
 * job runs under /usr/local/bin/node which already has it (same as the Gmail/text pullers).
 */
import Database from "better-sqlite3";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB = path.join(ROOT, "data", "contacts.db");
const SOURCE = "iPhone (synced)";
const log = (...a) => console.log(new Date().toISOString(), "sync-contacts:", ...a);

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "md", "dds"]);
const nameKey = (s) =>
  (s || "").toLowerCase().replace(/[^a-z, ]/g, " ").replace(/,/g, " ")
    .split(/\s+/).filter((t) => t.length > 1 && !SUFFIX.has(t)).sort().join(" ").trim();
const phone10 = (s) => { const d = (String(s || "").match(/\d/g) || []).join(""); return d.length >= 10 ? d.slice(-10) : ""; };
const fmtPhone = (d) => (d ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : "");

function addressBookDbs() {
  const base = path.join(os.homedir(), "Library", "Application Support", "AddressBook");
  const files = [path.join(base, "AddressBook-v22.abcddb")];
  try {
    const srcDir = path.join(base, "Sources");
    for (const d of fs.readdirSync(srcDir)) {
      const f = path.join(srcDir, d, "AddressBook-v22.abcddb");
      if (fs.existsSync(f)) files.push(f);
    }
  } catch {}
  return files.filter((f) => fs.existsSync(f));
}

// Pull every person (with their phones + emails) out of one AddressBook store.
function readStore(file) {
  let D;
  try { D = new Database(file, { readonly: true, fileMustExist: true }); } catch { return []; }
  const out = [];
  try {
    const phonesByOwner = {}, emailsByOwner = {};
    for (const r of D.prepare("SELECT ZOWNER o, ZFULLNUMBER v FROM ZABCDPHONENUMBER WHERE ZFULLNUMBER IS NOT NULL").all())
      (phonesByOwner[r.o] ||= []).push(r.v);
    for (const r of D.prepare("SELECT ZOWNER o, ZADDRESS v FROM ZABCDEMAILADDRESS WHERE ZADDRESS IS NOT NULL").all())
      (emailsByOwner[r.o] ||= []).push(r.v);
    for (const p of D.prepare("SELECT Z_PK pk, ZFIRSTNAME f, ZLASTNAME l, ZORGANIZATION org FROM ZABCDRECORD").all()) {
      const name = [p.f, p.l].filter(Boolean).join(" ").trim() || (p.org || "").trim();
      if (!name) continue;
      const phones = phonesByOwner[p.pk] || [];
      const emails = emailsByOwner[p.pk] || [];
      if (!phones.length && !emails.length) continue;
      out.push({ name, phones, emails });
    }
  } catch (e) { log("read error", file.split("/Sources/")[1]?.slice(0, 8) || "top", e.message); }
  D.close();
  return out;
}

function main() {
  if (!fs.existsSync(DB)) { log("no contacts.db — run build-contacts.mjs first"); process.exit(0); }
  const people = [];
  for (const f of addressBookDbs()) people.push(...readStore(f));
  log(`read ${people.length} people from ${addressBookDbs().length} address-book store(s)`);
  if (!people.length) { log("nothing to sync (no readable address-book people — check Full Disk Access)"); process.exit(0); }

  // Build the rows: one per phone (carrying the primary email), plus an email-only row when there's
  // no phone. So every number is phone-searchable and email-only contacts are still findable.
  const rows = [];
  for (const p of people) {
    const key = nameKey(p.name);
    const email = (p.emails[0] || "").trim();
    if (p.phones.length) {
      const seen = new Set();
      for (const ph of p.phones) {
        const p10 = phone10(ph);
        const k = p10 || ph;
        if (seen.has(k)) continue; seen.add(k);
        rows.push({ key, name: p.name, phone: p10 ? fmtPhone(p10) : ph.trim(), phone10: p10, email, source: SOURCE });
      }
    } else if (email) {
      rows.push({ key, name: p.name, phone: "", phone10: "", email, source: SOURCE });
    }
  }

  const db = new Database(DB);
  db.pragma("journal_mode = WAL"); // readers (the live app) keep working during the write
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM contacts WHERE source = ?").run(SOURCE);
    const ins = db.prepare("INSERT INTO contacts (key,name,phone,phone10,email,source) VALUES (@key,@name,@phone,@phone10,@email,@source)");
    for (const r of rows) ins.run(r);
  });
  tx();
  const total = db.prepare("SELECT COUNT(*) c FROM contacts").get().c;
  db.close();
  log(`synced ${rows.length} phone/email rows from ${people.length} contacts · index now ${total} rows`);
}

main();
