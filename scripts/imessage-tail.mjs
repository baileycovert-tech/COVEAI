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
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const CHATDB = path.join(process.env.HOME, "Library", "Messages", "chat.db");
const log = (...a) => console.log(new Date().toISOString(), ...a);
const APPLE_EPOCH_MS = 978307200000; // 2001-01-01 in ms since 1970

let chat;
try {
  chat = new Database(CHATDB, { readonly: true, fileMustExist: true });
} catch (e) {
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
  SELECT m.ROWID AS rowid, m.text AS text, m.date AS adate, m.is_from_me AS mine, h.id AS sender
  FROM message m LEFT JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.ROWID > ? AND m.is_from_me = 0 AND m.text IS NOT NULL
  ORDER BY m.ROWID ASC LIMIT 500
`).all(last);
chat.close();

if (!rows.length) { log("tail: no new messages"); meta.close(); process.exit(0); }

const inbox = rows.map((r) => ({
  rowid: r.rowid,
  content: r.text,
  date: new Date(r.adate / 1e6 + APPLE_EPOCH_MS).toISOString(),
  sender: r.sender || "unknown",
  is_from_me: false,
}));
import("fs").then((fs) => fs.writeFileSync(path.join(DATA, "_imessage-incoming.json"), JSON.stringify(inbox, null, 2) + "\n"));
setMeta.run("last_rowid", String(rows[rows.length - 1].rowid));
meta.close();

try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "imessage-ingest.mjs")], { encoding: "utf8", stdio: "inherit" }); } catch (e) { log("ingest err", e.message); }
log(`tail: fed ${inbox.length} new messages (rowids ${rows[0].rowid}..${rows[rows.length - 1].rowid})`);
