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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), ...a);
const phone10 = (s) => (String(s || "").match(/\d/g) || []).join("").slice(-10);
const kebab = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const titleCase = (s) => (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- watermark / dedup ----------
const db = new Database(path.join(DATA, "poll.db"));
db.exec("CREATE TABLE IF NOT EXISTS seen(key TEXT PRIMARY KEY, ts TEXT); CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);");
const isSeen = db.prepare("SELECT 1 FROM seen WHERE key=?");
const markSeen = db.prepare("INSERT OR IGNORE INTO seen(key,ts) VALUES(?,?)");

// ---------- classifier ----------
const VEHICLE = /\b(f-?150|f-?250|f-?350|super ?duty|silverado|sierra|tahoe|suburban|yukon|bronco|ranger|maverick|expedition|explorer|escape|equinox|traverse|colorado|corvette|camaro|mustang|wrangler|gladiator|jeep|ram|tundra|tacoma|4runner|truck|suv|sedan|car|vehicle|trade|king ranch|lariat|denali|raptor|z71|at4)\b/i;
const BUY = /\b(price|pricing|how much|payment|otd|out the door|finance|financing|interest rate|apr|available|in stock|do you have|still (there|available)|test drive|come (in|by|look)|see it|when can i|looking (for|to)|want to (buy|see|look)|quote|monthly)\b/i;
const SPAM = /(quince|reserve your|unsubscribe|opt-back|stop to opt|congratulations|you (have )?won|gift card|claim your|bit\.ly|tinyurl|snapchat\.com|sauna|perspire|verification code|do not share|did not request|confirmation #|opt-back into)/i;
// Bailey's own self-intercept SUMMARIES (not a single lead) — skip these.
const isBrief = (t) => /(AM brief|morning brief|dead.?lead matchmaker|reactivations queued|JUNE MTD|Pace:\s*\d|Gap to \d)/i.test(t);
const isInternalNote = (t) => /\b(self[- ]?test|automated test|send path works)\b/i.test(t);

// Strip iMessage binary attribute blobs (NSKeyedArchiver/bplist) + UI artifacts to get clean text.
function cleanText(s) {
  let t = (s || "").replace(/\\r/g, "\n").replace(/\\n/g, "\n");
  const cut = t.search(/NSDictionary|NSKeyedArchiver|bplist00|__kIM|\[Attachments:|\[URL:/);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");          // drop non-printable runs
  t = t.replace(/\s+iI\s*[a-z]?\s*$/i, "").replace(/\biI\b/g, " "); // the "iI" message-part marker
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

// Parse the two forwarded lead formats: "Customer: X ... P:phone ... Y:vehicle" and "NEW LEAD Name ... | vehicle | Stock X".
function parseLeadAlert(t) {
  // Format A — NEW LEAD
  const nl = t.match(/NEW LEAD\s+([A-Z][a-zA-Z'’.-]+(?: [A-Z][a-zA-Z'’.-]+){1,2})/);
  if (nl) {
    const name = nl[1].replace(/\s+(Walk|Capital|Carfax|Referral|Phone|Status|Stock).*$/i, "").trim();
    const veh = (t.match(/\|\s*(?:Vehicle:\s*)?([^|]+?)\s*\|/) || [])[1];
    const stock = (t.match(/Stock:?\s*([A-Z0-9]{4,8})\b/i) || [])[1];
    const source = (t.match(/(capital one|carfax|autotrader|cargurus|truecar|walk[- ]?in|referral|700credit)/i) || [])[1] || "iMessage";
    return { name: titleCase(name), phone: null, vehicle: veh && /none specified|inquiry/i.test(veh) ? "" : (veh || "").trim(), stock, source: titleCase(source) };
  }
  // Format B — Customer:/P:/Y:
  if (!/(700credit|text response received|^customer:)/im.test(t) && !/\bP:\s*\(?\d/.test(t)) return null;
  const name = (t.match(/customer:\s*([^\n\r]+)/i) || t.match(/^\s*([A-Z][a-z]+ [A-Z][a-z]+)/m) || [])[1];
  const phone = (t.match(/P:\s*([()\d .-]{7,})/i) || [])[1];
  const veh = (t.match(/Y:\s*([^\n\r]+)/i) || [])[1];
  const stock = (t.match(/\(([A-Z0-9]{4,8})\)/) || [])[1];
  const source = (t.match(/(700credit\.?com|carfax|autotrader|cargurus|truecar|capital one)/i) || [])[1] || "iMessage";
  if (!name && !phone) return null;
  return { name: name && titleCase(name.trim()), phone: phone && phone10(phone), vehicle: veh && veh.trim(), stock, source: titleCase(source) };
}

function classify(msg, customersByPhone) {
  const text = cleanText(msg.text);
  if (!text || isInternalNote(text) || isBrief(text)) return { type: "internal" };
  if (SPAM.test(text) || (msg.url && text.replace(msg.url, "").trim().length < 4)) return { type: "spam" };

  const alert = parseLeadAlert(text);
  if (alert) return { type: "lead", ...alert, text };

  // direct message from a real contact
  const senderPhone = phone10(msg.sender);
  const existing = customersByPhone[senderPhone];
  const looksLikeLead = VEHICLE.test(text) || BUY.test(text);
  if (existing) return { type: "followup", slug: existing.slug, name: existing.name, phone: senderPhone, text, hot: looksLikeLead };
  if (looksLikeLead && senderPhone.length === 10) return { type: "lead", name: null, phone: senderPhone, vehicle: (text.match(VEHICLE) || [])[0], source: "iMessage", text };
  return { type: "other", phone: senderPhone, text };
}

// ---------- main ----------
const inbox = read("_imessage-incoming.json", null) || read("_imessage-fixture.json", []);
const customers = [...read("customers.json", []), ...read("wiki-customers.json", [])];
const byPhone = {};
for (const c of customers) if (c.phone) byPhone[phone10(c.phone)] = c;

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
      name: c.name || existing?.name || "Texter " + (c.phone ? c.phone.slice(-4) : ""),
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

// rebuild the connected pipeline so the new text-leads show on the board
try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-crm.mjs")], { encoding: "utf8" }); } catch (e) { log("build-crm err", e.message); }
log("imessage-ingest:", JSON.stringify(status));
