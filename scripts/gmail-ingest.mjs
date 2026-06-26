#!/usr/bin/env node
/**
 * gmail-ingest.mjs — turn lead-notification emails into leads, losslessly.
 *
 * Same seam as iMessage: this reads an inbox file data/_gmail-incoming.json (raw emails) and
 * never talks to Gmail itself, so the producer can be the Gmail MCP (a Claude/scheduled session)
 * or a fixture. The vendor lead emails (700credit, Carfax, AutoTrader, CarGurus, Capital One,
 * VinSolutions) use the SAME two formats as the forwarded texts, so we reuse the shared parser.
 *
 * Inbox row: { message_id, from, to, subject, body, date }
 * Watermark + dedup in data/poll.db (seen key = "gmail:<message_id>") so nothing is reprocessed
 * or missed. Writes data/gmail-leads.json (build-crm unions it) and appends follow-ups to the
 * shared message log (imessage-threads.json) so a customer's profile shows texts AND emails.
 */
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { phone10, kebab, titleCase, cleanText, parseLeadAlert, VEHICLE, BUY, SPAM, GENERIC_VEH, isBrief, isInternalNote } from "./lib-leads.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), "gmail-ingest:", ...a);
const emailOf = (s) => (String(s || "").match(/[\w.+-]+@[\w.-]+\.\w+/) || [""])[0].toLowerCase();
const nameOf = (from) => titleCase((String(from || "").replace(/<[^>]*>/, "").replace(/["']/g, "").trim()) || "");
// Automation/no-reply senders are never a "person" lead by themselves — but their BODY may carry a
// parsed lead alert, which is handled before we ever look at the sender.
const NOREPLY = /(no-?reply|do-?not-?reply|notification|mailer-daemon|postmaster)@/i;

const db = new Database(path.join(DATA, "poll.db"));
db.exec("CREATE TABLE IF NOT EXISTS seen(key TEXT PRIMARY KEY, ts TEXT);");
const isSeen = db.prepare("SELECT 1 FROM seen WHERE key=?");
const markSeen = db.prepare("INSERT OR IGNORE INTO seen(key,ts) VALUES(?,?)");

function classify(mail, customersByEmail) {
  const text = cleanText((mail.subject ? mail.subject + "\n" : "") + (mail.body || ""));
  if (!text || isInternalNote(text) || isBrief(text)) return { type: "internal" };
  if (SPAM.test(text)) return { type: "spam" };

  // Vendor lead-notification email — the body is a NEW LEAD / Customer:/P:/Y: block.
  const alert = parseLeadAlert(text);
  if (alert) return { type: "lead", ...alert, text, source: alert.source && alert.source !== "Imessage" ? alert.source : "Email" };

  // Direct email from a person.
  const from = emailOf(mail.from);
  const existing = customersByEmail[from];
  const vehMatch = (text.match(VEHICLE) || [])[0];
  const hasBuy = BUY.test(text);
  if (existing) return { type: "followup", slug: existing.slug, name: existing.name, email: from, text, hot: !!vehMatch || hasBuy };
  if (NOREPLY.test(mail.from || "")) return { type: "other" }; // automated, no parseable lead
  const strongVeh = vehMatch && !GENERIC_VEH.test(vehMatch);
  if (strongVeh || hasBuy) return { type: "lead", name: nameOf(mail.from), phone: null, email: from, vehicle: strongVeh ? vehMatch : "", source: "Email", text };
  return { type: "other" };
}

const inbox = read("_gmail-incoming.json", null) || read("_gmail-fixture.json", []);
const customers = [...read("customers.json", []), ...read("wiki-customers.json", [])];
const byEmail = {};
for (const c of customers) if (c.email) byEmail[String(c.email).toLowerCase()] = c;

const leads = read("gmail-leads.json", []);
const leadByKey = new Map(leads.map((l) => [l.email || l.phone || kebab(l.name), l]));
const threads = read("imessage-threads.json", {});
let nLead = 0, nFollow = 0, nSpam = 0, nDup = 0;

for (const raw of inbox) {
  const mail = { message_id: raw.message_id || raw.id, from: raw.from, subject: raw.subject, body: raw.body || raw.text || "", date: raw.date };
  const key = "gmail:" + (mail.message_id || crypto.createHash("sha1").update((mail.from || "") + "|" + (mail.date || "") + "|" + (mail.subject || "")).digest("hex").slice(0, 16));
  if (isSeen.get(key)) { nDup++; continue; }
  markSeen.run(key, new Date().toISOString());

  const c = classify(mail, byEmail);
  if (c.type === "spam") nSpam++;
  if (c.type === "lead") {
    const lk = c.email || c.phone || kebab(c.name);
    const existing = leadByKey.get(lk);
    const entry = {
      slug: existing?.slug || "gmail-" + (kebab(c.name || "") || (lk || crypto.randomBytes(3).toString("hex"))),
      name: c.name || existing?.name || (c.email ? c.email.split("@")[0] : "Email lead"),
      phone: c.phone || existing?.phone || null, email: c.email || existing?.email || null,
      vehicle: c.vehicle || existing?.vehicle || "", source: c.source || "Email",
      stock: c.stock || existing?.stock || null, at: mail.date, lastMsg: (c.text || "").slice(0, 160), hot: true, channel: "Gmail",
    };
    leadByKey.set(lk, entry);
    (threads[entry.slug] ||= []).push({ at: mail.date, text: c.text, dir: "in", channel: "email" });
    nLead++;
  } else if (c.type === "followup") {
    (threads[c.slug] ||= []).push({ at: mail.date, text: c.text, dir: "in", channel: "email" });
    nFollow++;
  }
}

const finalLeads = [...leadByKey.values()].sort((a, b) => (b.at || "").localeCompare(a.at || ""));
write("gmail-leads.json", finalLeads);
write("imessage-threads.json", threads);
write("gmail-status.json", { at: new Date().toISOString(), processed: inbox.length, newLeads: nLead, followups: nFollow, spam: nSpam, dupes: nDup, totalGmailLeads: finalLeads.length });
db.close();

// AI context pass (handles email-driven intent changes too) → rebuilds the board.
try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "enrich-context.mjs")], { encoding: "utf8", stdio: "inherit" }); } catch (e) { log("enrich-context err", e.message); }
log(JSON.stringify({ processed: inbox.length, newLeads: nLead, followups: nFollow, spam: nSpam, dupes: nDup }));
