#!/usr/bin/env node
/**
 * imessage-tail.mjs — autonomous iMessage source. Reads NEW inbound messages straight
 * from ~/Library/Messages/chat.db, writes them to the inbox (_imessage-incoming.json),
 * and runs imessage-ingest. No Claude / MCP needed — but the running process needs
 * macOS FULL DISK ACCESS (System Settings → Privacy & Security → Full Disk Access →
 * add the thing that runs this, e.g. node / the launchd helper). Until then this exits
 * cleanly and the MCP-fed path keeps working.
 *
 * Watermark = max message ROWID seen, stored in data/poll.db (meta.last_rowid).
 */
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const CHATDB = path.join(process.env.HOME, "Library", "Messages", "chat.db");
const log = (...a) => console.log(new Date().toISOString(), ...a);
const APPLE_EPOCH_MS = 978307200000; // 2001-01-01 in ms since 1970

// Modern macOS stores most message text in `attributedBody` (a typedstream NSAttributedString blob),
// leaving `message.text` NULL — so filtering on text IS NOT NULL silently drops ~60% of inbound,
// including lead notifications. Decode the plain text out of the blob.
function decodeAttributedBody(buf) {
  if (!buf || !buf.length) return "";
  const i = buf.indexOf("NSString");
  if (i < 0) return "";
  let p = i + 8;
  const plus = buf.indexOf(0x2b, p);              // '+' precedes the length
  p = (plus >= 0 && plus < p + 12 ? plus : p) + 1;
  let len = buf[p]; p += 1;
  if (len === 0x81) { len = buf.readUInt16LE(p); p += 2; }
  else if (len === 0x82) { len = buf.readUInt32LE(p); p += 4; }
  if (!len || len > buf.length - p) return "";
  const t = buf.slice(p, p + len).toString("utf8");
  return /[\x20-\x7E]/.test(t) ? t : "";          // must contain printable content
}

// Heartbeat for Data Health — written EVERY run so the app can tell "tail is alive but the Mac
// stopped receiving texts" (newestMessageAt goes stale) from "tail/chat.db is broken".
const HEALTH = path.join(DATA, "imessage-health.json");
const writeHealth = (o) => { try { fs.writeFileSync(HEALTH, JSON.stringify({ ranAt: new Date().toISOString(), ...o }, null, 2) + "\n"); } catch {} };

let chat;
try {
  chat = new Database(CHATDB, { readonly: true, fileMustExist: true });
} catch (e) {
  writeHealth({ chatDbReadable: false, error: e.message.split("\n")[0] });
  log("chat.db not readable (grant Full Disk Access). Skipping autonomous tail.", e.message.split("\n")[0]);
  process.exit(0);
}

const meta = new Database(path.join(DATA, "poll.db"));
meta.exec("CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);");
const getMeta = (k) => meta.prepare("SELECT v FROM meta WHERE k=?").get(k)?.v;
const setMeta = meta.prepare("INSERT INTO meta(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v");
const last = Number(getMeta("last_rowid") || 0);

// inbound messages newer than the watermark, with the contact's phone/email
const rows = chat.prepare(`
  SELECT m.ROWID AS rowid, m.text AS text, m.attributedBody AS abody, m.date AS adate, m.is_from_me AS mine, h.id AS sender
  FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.ROWID > ? AND m.is_from_me = 0 AND (m.text IS NOT NULL OR m.attributedBody IS NOT NULL)
  ORDER BY m.ROWID ASC LIMIT 1500
`).all(last);
// Newest-message timestamps (regardless of direction/content) — the real "is the Mac still
// receiving texts?" signal — captured before we close chat.db.
const newestRaw = chat.prepare("SELECT MAX(date) d FROM message").get()?.d;
const newestInRaw = chat.prepare("SELECT MAX(date) d FROM message WHERE is_from_me = 0").get()?.d;
const maxRowid = chat.prepare("SELECT MAX(ROWID) r FROM message").get()?.r;
chat.close();
const toIso = (d) => (d ? new Date(d / 1e6 + APPLE_EPOCH_MS).toISOString() : null);
const heartbeat = (extra = {}) => writeHealth({ chatDbReadable: true, newestMessageAt: toIso(newestRaw), newestInboundAt: toIso(newestInRaw), watermark: last, maxRowid: maxRowid || null, ...extra });

if (!rows.length) { heartbeat(); log("tail: no new messages"); meta.close(); process.exit(0); }

const advanceTo = rows[rows.length - 1].rowid; // advance past EVERY row we examined (incl. reactions)
const inbox = rows
  .map((r) => ({
    rowid: r.rowid,
    content: (r.text && r.text.trim()) ? r.text : decodeAttributedBody(r.abody),
    date: new Date(r.adate / 1e6 + APPLE_EPOCH_MS).toISOString(),
    sender: r.sender || "unknown",
    is_from_me: false,
  }))
  .filter((m) => m.content && m.content.trim()); // drop reactions/tapbacks with no text

// If this batch was ALL reactions/no-text, just advance the watermark past them — no ingest needed.
if (!inbox.length) { setMeta.run("last_rowid", String(advanceTo)); heartbeat(); log(`tail: ${rows.length} non-text rows skipped (advanced to ${advanceTo})`); meta.close(); process.exit(0); }

// Write the inbox SYNCHRONOUSLY and confirm it landed BEFORE running ingest — otherwise
// ingest races against a not-yet-written file and processes the stale inbox.
fs.writeFileSync(path.join(DATA, "_imessage-incoming.json"), JSON.stringify(inbox, null, 2) + "\n");

// Advance the watermark ONLY after ingest succeeds, so a crash mid-ingest re-feeds these
// next run instead of skipping them. (ingest's own per-row dedup makes the re-feed a no-op.)
try {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "imessage-ingest.mjs")], { encoding: "utf8", stdio: "inherit" });
  setMeta.run("last_rowid", String(advanceTo));
  heartbeat({ fed: inbox.length });
  log(`tail: fed ${inbox.length} new messages (advanced to ${advanceTo})`);
} catch (e) {
  log("ingest err — watermark NOT advanced, will retry next run:", e.message);
} finally {
  meta.close();
}
