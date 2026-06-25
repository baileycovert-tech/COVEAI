import fs from "fs";
import path from "path";
import webpush from "web-push";

const DATA = path.join(process.cwd(), "data");
const SUBS = path.join(DATA, "push-subs.json");

type Sub = { slug: string; subscription: any; createdAt: string };

function configured() {
  const pub = process.env.VAPID_PUBLIC || process.env.NEXT_PUBLIC_VAPID_PUBLIC;
  const priv = process.env.VAPID_PRIVATE;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@covertauto.com", pub, priv);
  return true;
}

export function readSubs(): Sub[] {
  try { return JSON.parse(fs.readFileSync(SUBS, "utf8")); } catch { return []; }
}
function writeSubs(s: Sub[]) { fs.writeFileSync(SUBS, JSON.stringify(s, null, 2) + "\n"); }

export function saveSub(slug: string, subscription: any) {
  const subs = readSubs().filter((s) => s.subscription?.endpoint !== subscription?.endpoint);
  subs.push({ slug, subscription, createdAt: new Date().toISOString() });
  writeSubs(subs);
}

// Send a push to every device a given rep has registered. Prunes dead subscriptions.
export async function pushToSlug(slug: string, payload: { title: string; body: string; url?: string; urgent?: boolean; tag?: string }) {
  if (!configured()) return { sent: 0, error: "VAPID not configured" };
  const subs = readSubs();
  const mine = subs.filter((s) => s.slug === slug);
  let sent = 0;
  const dead: string[] = [];
  await Promise.all(mine.map(async (s) => {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.subscription.endpoint);
    }
  }));
  if (dead.length) writeSubs(readSubs().filter((s) => !dead.includes(s.subscription?.endpoint)));
  return { sent };
}
