import fs from "fs";
import path from "path";

// Per-employee identity COVE uses to attribute leads to the right rep: the phone number(s)
// their customers text, and the Gmail address(es) their leads come into. Keyed by user slug.
// (Their DMS S1 numbers already live in users.json — fordS1/chevyS1.)
const FILE = path.join(process.cwd(), "data", "user-profiles.json");

export type UserProfile = { phones: string[]; emails: string[] };

const phone10 = (s: string) => (String(s || "").match(/\d/g) || []).join("").slice(-10);

function readAll(): Record<string, UserProfile> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}

export function getUserProfile(slug: string): UserProfile {
  const p = readAll()[slug];
  return { phones: p?.phones || [], emails: p?.emails || [] };
}

// Normalized 10-digit phones for matching captured threads to this rep.
export function getProfilePhones(slug: string): string[] {
  return getUserProfile(slug).phones.map(phone10).filter((p) => p.length === 10);
}

export function setUserProfile(slug: string, patch: Partial<UserProfile>): UserProfile {
  const all = readAll();
  const cur = all[slug] || { phones: [], emails: [] };
  const clean = (arr: string[], lower = false) =>
    [...new Set(arr.map((x) => (lower ? x.trim().toLowerCase() : x.trim())).filter(Boolean))];
  const next: UserProfile = {
    phones: clean(patch.phones ?? cur.phones),
    emails: clean(patch.emails ?? cur.emails, true),
  };
  all[slug] = next;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
  return next;
}
