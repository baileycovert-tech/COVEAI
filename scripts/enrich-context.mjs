#!/usr/bin/env node
/**
 * enrich-context.mjs — keep each customer's CONTEXT live as new texts arrive.
 *
 * The problem this fixes: a customer says they want an F-150, then later texts
 * "actually, what about the Tahoe?" — their profile must follow the change, not
 * stay frozen on the F-150. Message logs alone don't do that; this does.
 *
 * How: for every thread with NEW inbound messages (tracked by a per-thread
 * watermark in poll.db so we never re-bill or re-process), COVE (Claude) reads
 * the recent messages + their known interest and returns the CURRENT vehicle
 * interest and whether it changed. When it changed we write a context-override
 * that build-crm applies on top of everything (so vehicle_interest, the board,
 * and the inventory matches all update). No key / API failure → we skip the AI
 * and still rebuild, so the pipeline never stalls.
 *
 * Runs build-crm.mjs at the end. Called by imessage-ingest after every pull.
 */
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const read = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const write = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const log = (...a) => console.log(new Date().toISOString(), "enrich-context:", ...a);
const normName = (s) => (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Load ANTHROPIC_API_KEY from .env.local (scripts don't get it automatically).
function loadKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  try {
    const env = fs.readFileSync(path.join(ROOT, ".env.local"), "utf8");
    const m = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    return m ? m[1].trim() : null;
  } catch { return null; }
}

function rebuildAndExit(code = 0) {
  try { execFileSync(process.execPath, [path.join(ROOT, "scripts", "build-crm.mjs")], { encoding: "utf8", stdio: "inherit" }); }
  catch (e) { log("build-crm err", e.message); }
  process.exit(code);
}

const threads = read("imessage-threads.json", {});
const customersBySlug = {};
for (const c of [...read("customers.json", []), ...read("wiki-customers.json", [])]) if (c.slug) customersBySlug[c.slug] = c;
const textLeadBySlug = {};
for (const l of read("imessage-leads.json", [])) if (l.slug) textLeadBySlug[l.slug] = l;

const key = loadKey();
if (!key) { log("no API key — skipping AI context pass, rebuilding only"); rebuildAndExit(0); }

// watermark: last inbound message timestamp we've already extracted from, per thread
const db = new Database(path.join(DATA, "poll.db"));
db.exec("CREATE TABLE IF NOT EXISTS ctx_seen(slug TEXT PRIMARY KEY, last_ts TEXT);");
const getCtx = db.prepare("SELECT last_ts FROM ctx_seen WHERE slug=?");
const setCtx = db.prepare("INSERT INTO ctx_seen(slug,last_ts) VALUES(?,?) ON CONFLICT(slug) DO UPDATE SET last_ts=excluded.last_ts");

// gather threads with new inbound messages
const work = [];
for (const [slug, msgs] of Object.entries(threads)) {
  const inbound = (msgs || []).filter((m) => m.dir === "in" && m.text);
  if (!inbound.length) continue;
  const last = getCtx.get(slug)?.last_ts || "";
  const fresh = inbound.filter((m) => (m.at || "") > last);
  if (!fresh.length) continue;
  const known = customersBySlug[slug] || textLeadBySlug[slug] || {};
  work.push({ slug, name: known.name || textLeadBySlug[slug]?.name || "", knownVehicle: known.vehicle_interest || textLeadBySlug[slug]?.vehicle || "", recent: inbound.slice(-8), latestTs: inbound[inbound.length - 1].at });
}

if (!work.length) { log("no threads with new messages"); db.close(); rebuildAndExit(0); }

const SYSTEM = `You read a car salesperson's text thread with ONE customer and report what vehicle that customer CURRENTLY wants. People change their mind ("actually, scratch the F-150, what about a Tahoe?") — report the LATEST intent, not the first. Reply with ONLY a JSON object, no prose:
{"vehicle":"<current vehicle of interest, concise e.g. '2024 Tahoe' or '' if genuinely unclear>","changed":<true|false vs their known interest>,"previous":"<their prior vehicle if it changed, else ''>","note":"<<=90 char human summary of the change or current intent>","confidence":<0.0-1.0>}
Rules: only report a vehicle the CUSTOMER expressed interest in. If they never mention a specific vehicle, vehicle="". changed=true only if the current vehicle clearly differs from the known interest below.`;

const overrides = read("context-overrides.json", {});
const client = await import("@anthropic-ai/sdk").then((m) => new m.default({ apiKey: key }));
const model = process.env.CONTEXT_MODEL || "claude-sonnet-4-6";
let updated = 0, scanned = 0;

for (const w of work) {
  scanned++;
  const convo = w.recent.map((m) => `Customer: ${m.text}`).join("\n");
  const user = `KNOWN interest on file: ${w.knownVehicle || "(none yet)"}\nCustomer name: ${w.name || "(unknown)"}\n\nRecent messages (oldest→newest):\n${convo}`;
  let parsed = null;
  try {
    const resp = await client.messages.create({ model, max_tokens: 300, system: SYSTEM, messages: [{ role: "user", content: user }] });
    const text = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch (e) {
    log(`extract failed for ${w.slug}: ${String(e.message).split("\n")[0]}`);
    continue; // leave watermark unmoved so we retry next run
  }
  setCtx.run(w.slug, w.latestTs || new Date().toISOString());

  const veh = (parsed.vehicle || "").trim();
  const conf = Number(parsed.confidence || 0);
  // Only override when we have a confident, real vehicle that differs from what's on file.
  if (veh && conf >= 0.6 && norm(veh) !== norm(w.knownVehicle)) {
    const k = normName(w.name);
    if (!k) continue;
    overrides[k] = {
      name: w.name,
      slug: w.slug,
      vehicle_interest: veh,
      note: parsed.changed
        ? `Switched to ${veh}${parsed.previous ? ` (was ${parsed.previous})` : ""} — per text ${(w.latestTs || "").slice(0, 10)}`
        : `Current interest: ${veh} — per text ${(w.latestTs || "").slice(0, 10)}`,
      changed: !!parsed.changed,
      at: new Date().toISOString(),
    };
    updated++;
    log(`${w.name || w.slug}: ${w.knownVehicle || "(none)"} → ${veh}${parsed.changed ? " [changed]" : ""}`);
  }
}

write("context-overrides.json", overrides);
db.close();
log(`scanned ${scanned} thread(s), updated ${updated} interest(s)`);
rebuildAndExit(0);
