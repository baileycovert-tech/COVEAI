#!/usr/bin/env node
/**
 * push-send.mjs — send a web-push notification to one rep (by login slug).
 * Called by the covert-crm-notify scheduled task.
 *
 * Usage: node scripts/push-send.mjs <slug> <title> <body> [url]
 * Prints {"sent": N} or {"sent":0,"error":"..."}.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");

// Load VAPID keys from .env.local (plain node doesn't read it automatically).
function loadEnv() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
  } catch {}
  return out;
}

const [, , slug, title, body, url] = process.argv;
const done = (o) => { console.log(JSON.stringify(o)); process.exit(o.error ? 1 : 0); };
if (!slug || !title) done({ sent: 0, error: "usage: push-send.mjs <slug> <title> <body> [url]" });

const env = loadEnv();
const pub = env.VAPID_PUBLIC || env.NEXT_PUBLIC_VAPID_PUBLIC;
const priv = env.VAPID_PRIVATE;
if (!pub || !priv) done({ sent: 0, error: "VAPID keys missing in .env.local" });
webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@covertauto.com", pub, priv);

let subs = [];
try { subs = JSON.parse(fs.readFileSync(path.join(DATA, "push-subs.json"), "utf8")); } catch {}
const mine = subs.filter((s) => s.slug === slug);
const payload = JSON.stringify({ title, body: body || "", url: url || "/", urgent: true, tag: "lead" });

let sent = 0;
const dead = [];
await Promise.all(mine.map(async (s) => {
  try { await webpush.sendNotification(s.subscription, payload); sent++; }
  catch (e) { if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.subscription.endpoint); }
}));
if (dead.length) {
  const kept = subs.filter((s) => !dead.includes(s.subscription?.endpoint));
  fs.writeFileSync(path.join(DATA, "push-subs.json"), JSON.stringify(kept, null, 2) + "\n");
}
done({ sent });
