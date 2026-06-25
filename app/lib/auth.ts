import crypto from "crypto";
import fs from "fs";
import path from "path";
import { cookies } from "next/headers";

const DATA = path.join(process.cwd(), "data");

export type User = {
  slug: string; name: string; fordS1: string | null; chevyS1: string | null;
  hashes: string[]; isAdmin?: boolean;
};

function readUsers(): User[] {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8")); }
  catch { return []; }
}

function secret(): string {
  // Prefer an env override; fall back to the generated file.
  if (process.env.CRM_SESSION_SECRET) return process.env.CRM_SESSION_SECRET;
  try { return fs.readFileSync(path.join(DATA, ".session-secret"), "utf8").trim(); }
  catch { return "covert-crm-dev-secret-change-me"; }
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const b64u = (s: string) => Buffer.from(s).toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url").toString("utf8");

export const COOKIE = "crm_session";

// List of {slug,name} for the login picker (no secrets).
export function loginRoster() {
  return readUsers().map((u) => ({ slug: u.slug, name: u.name })).sort((a, b) => a.name.localeCompare(b.name));
}

// Verify by employee number (the credential — it's unique per rep). The optional
// name only disambiguates the unlikely case of two reps sharing a number.
export function verifyLogin(idOrSlug: string, password: string): User | null {
  const users = readUsers();
  const h = sha(String(password).trim());
  const matches = users.filter((u) => u.hashes.includes(h));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  const norm = (s: string) => (s || "").toLowerCase().trim();
  return matches.find((u) => u.slug === idOrSlug || norm(u.name) === norm(idOrSlug)) || matches[0];
}

export function getUserBySlug(slug: string): User | null {
  return readUsers().find((u) => u.slug === slug) || null;
}

// Server-component helper: the logged-in rep (or null). Reads the request cookie.
export function currentUser(): { slug: string; name: string; isAdmin: boolean } | null {
  const s = readSession(cookies().get(COOKIE)?.value);
  if (!s) return null;
  const u = getUserBySlug(s.slug);
  return { slug: s.slug, name: s.name, isAdmin: !!(u && u.isAdmin) };
}

// ---- signed session cookie: payload.signature ----
export function signSession(slug: string, name: string, days = 30): string {
  const payload = b64u(JSON.stringify({ slug, name, exp: Date.now() + days * 864e5 }));
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readSession(token?: string): { slug: string; name: string } | null {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(unb64u(payload));
    if (!data.exp || data.exp < Date.now()) return null;
    return { slug: data.slug, name: data.name };
  } catch { return null; }
}
