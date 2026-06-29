import fs from "fs";
import path from "path";

// Per-rep Gmail SENDING credential so email blasts go out AS that rep (not Bailey).
// Stored locally (data/ is gitignored), mirroring how the deal-mailer keeps Bailey's app
// password. The password is never returned to the client — only whether one is set.
const FILE = path.join(process.cwd(), "data", "user-sending.json");

type Cred = { gmailUser: string; appPassword: string };
export type SendingStatus = { gmailUser: string; hasPassword: boolean };

function readAll(): Record<string, Cred> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}

// Full credential — server-side only (used by the send route).
export function getSending(slug: string): Cred | null {
  const c = readAll()[slug];
  return c && c.gmailUser && c.appPassword ? c : null;
}

// Safe status for the UI — no password.
export function getSendingStatus(slug: string): SendingStatus {
  const c = readAll()[slug];
  return { gmailUser: c?.gmailUser || "", hasPassword: !!c?.appPassword };
}

// gmailUser="" clears it. appPassword undefined = keep existing (lets you update the address only).
export function setSending(slug: string, gmailUser: string, appPassword?: string): SendingStatus {
  const all = readAll();
  const user = (gmailUser || "").trim().toLowerCase();
  if (!user) {
    delete all[slug];
  } else {
    const prev = all[slug];
    all[slug] = { gmailUser: user, appPassword: appPassword != null && appPassword !== "" ? appPassword.replace(/\s+/g, "") : (prev?.appPassword || "") };
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
  return getSendingStatus(slug);
}
