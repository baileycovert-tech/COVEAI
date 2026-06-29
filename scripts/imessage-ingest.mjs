#!/usr/bin/env node
/**
 * imessage-ingest.mjs — turn incoming iMessages into leads, losslessly.
 *
 * THE SEAM: this script consumes data/_imessage-incoming.json — an "inbox" of raw
 * messages — and never talks to iMessage itself. That keeps it source-agnostic:
 *   • a Claude session / scheduled task writes the inbox via the Read_and_Send_iMessages MCP
 *   • OR scripts/imessage-tail.mjs reads ~/Library/Messages/chat.db directly (needs Full Disk
 *     Access) and writes the inbox — fully autonomous
 *   • OR a recorded fixture (data/_imessage-fixture.json) for testing with no connector
 * Inbox row shape (matches the MCP output): { content|text, date, sender, is_from_me, url? }
 *
 * Watermark + dedup live in data/poll.db (SQLite) so we NEVER reprocess or miss a message,
 * even across restarts. Never fabricates — only what the inbox contained.
 */
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { phone10, kebab, titleCase, cleanText, parseLeadAlert, VEHICLE, BUY, SPAM, TAPBACK, GENERIC_VEH, SELF_NUMBERS, isBrief, isInternalNote } from "./lib-leads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), ...a);
// ---------- watermark / dedup ----------
const db = new Database(path.join(DATA, "poll.db"));
db.exec("CREATE TABLE IF NOT EXISTS seen(key TEXT PRIMARY KEY, ts TEXT); CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);");
const isSeen = db.prepare("SELECT 1 FROM seen WHERE key=?");
const markSeen = db.prepare("INSERT OR IGNORE INTO seen(key,ts) VALUES(?,?)");

// ---------- classifier (vocabulary + parsers live in lib-leads.mjs, shared with gmail/vinsolutions) ----------
function classify(msg, customersByPhone) {
  const text = cleanText(msg.text);
  if (!text || isInternalNote(text) || isBrief(text) || TAPBACK.test(text)) return { type: "internal" };
  if (SPAM.test(text) || (msg.url && text.replace(msg.url, "").trim().length < 4)) return { type: "spam" };

  const alert = parseLeadAlert(text);
  if (alert) return { type: "lead", ...alert, text };

  // direct message from a real contact
  const senderPhone = phone10(msg.sender);
  if (SELF_NUMBERS.has(senderPhone)) return { type: "internal" }; // Bailey texting himself / outreach echo
  const existing = customersByPhone[senderPhone];
  const vehMatch = (text.match(VEHICLE) || [])[0];
  const hasBuy = BUY.test(text);
  // Known customer → always a follow-up; a vehicle/buy mention marks it hot.
  if (existing) return { type: "followup", slug: existing.slug, name: existing.name, phone: senderPhone, text, hot: !!vehMatch || hasBuy };
  // Unknown sender → only a NEW lead on a real signal: a specific model or buy intent.
  // A bare generic word with no buy language is noise, not a lead.
  const strongVeh = vehMatch && !GENERIC_VEH.test(vehMatch);
  if ((strongVeh || hasBuy) && senderPhone.length === 10) return { type: "lead", name: null, phone: senderPhone, vehicle: strongVeh ? vehMatch : "", source: "iMessage", text };
  return { type: "other", phone: senderPhone, text };
}

// ---------- main ----------
const inbox = read("_imessage-incoming.json", null) || read("_imessage-fixture.json", []);
const customers = [...read("customers.json", []), ...read("wiki-customers.json", [])];
const byPhone = {};
for (const c of customers) if (c.phone) byPhone[phone10(c.phone)] = c;

// Resolve an unknown texter's phone → real name from the 58k contacts index, so a lead isn't a
// nameless "Texter ####" (and can then be matched against the sold list and deduped properly).
let contactQ = null;
try {
  const cdb = new Database(path.join(DATA, "contacts.db"), { readonly: true, fileMustExist: true });
  contactQ = cdb.prepare("SELECT name FROM contacts WHERE phone10=? AND name<>'' LIMIT 1");
} catch { contactQ = null; }
const resolveName = (phone) => { if (!contactQ || !phone) return null; try { return contactQ.get(phone)?.name || null; } catch { return null; } };

const leads = read("imessage-leads.json", []);
const leadByKey = new Map(leads.map((l) => [l.phone || kebab(l.name), l]));
const threads = read("imessage-threads.json", {});
let nLead = 0, nFollow = 0, nSpam = 0, nDup = 0;

for (const raw of inbox) {
  const msg = { text: (raw.content || raw.text || "").replace(/\\r/g, "\n").replace(/\\n/g, "\n"), date: raw.date, sender: raw.sender, is_from_me: raw.is_from_me, url: raw.url };
  if (msg.is_from_me) continue;
  const key = raw.rowid != null ? "row:" + raw.rowid : "h:" + crypto.createHash("sha1").update((msg.sender || "") + "|" + (msg.date || "") + "|" + msg.text).digest("hex").slice(0, 16);
  if (isSeen.get(key)) { nDup++; continue; }
  markSeen.run(key, new Date().toISOString());

  const c = classify(msg, byPhone);
  if (c.type === "spam") nSpam++;
  if (c.type === "lead") {
    const lk = c.phone || kebab(c.name);
    const existing = leadByKey.get(lk);
    const entry = {
      slug: existing?.slug || "imsg-" + (lk || crypto.randomBytes(3).toString("hex")),
      name: c.name || existing?.name || resolveName(c.phone) || "Texter " + (c.phone ? c.phone.slice(-4) : ""),
      phone: c.phone || null, vehicle: c.vehicle || existing?.vehicle || "", source: c.source || "iMessage",
      stock: c.stock || existing?.stock || null, at: msg.date, lastMsg: c.text.slice(0, 160), hot: true, channel: "iMessage",
    };
    leadByKey.set(lk, entry);
    (threads[entry.slug] ||= []).push({ at: msg.date, text: c.text, dir: "in" });
    nLead++;
  } else if (c.type === "followup") {
    (threads[c.slug] ||= []).push({ at: msg.date, text: c.text, dir: "in" });
    nFollow++;
  }
}

const finalLeads = [...leadByKey.values()].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
write("imessage-leads.json", finalLeads);
write("imessage-threads.json", threads);
const status = { at: new Date().toISOString(), processed: inbox.length, newLeads: nLead, followups: nFollow, spam: nSpam, dupes: nDup, totalTextLeads: finalLeads.length };
write("imessage-status.json", status);
db.close();

// run the AI context pass (updates vehicle interest when a customer changes their
// mind), which rebuilds the connected pipeline at the end.
try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "enrich-context.mjs")], { encoding: "utf8" }); } catch (e) { log("enrich-context err", e.message); }
log("imessage-ingest:", JSON.stringify(status));
