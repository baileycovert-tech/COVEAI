import fs from "fs";
import path from "path";

// Manually-entered contact info for an outreach target. Wins over the contacts.db
// enrichment (Bailey typed it, so trust it). Keyed by a normalized name so it
// survives the nightly build-crm rebuild (lead slugs are regenerated, names aren't).
const FILE = path.join(process.cwd(), "data", "contact-overrides.json");

const normName = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export type Override = { name: string; phone: string | null; email: string | null; at: string };

function readAll(): Record<string, Override> {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return {};
  }
}

export function getOverride(name: string): Override | null {
  if (!name) return null;
  return readAll()[normName(name)] || null;
}

// Validate + tidy. Returns null when the value is present but unusable.
export function cleanPhone(raw?: string | null): string | null {
  if (raw == null || raw === "") return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return "INVALID";
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

export function cleanEmail(raw?: string | null): string | null {
  if (raw == null || raw === "") return null;
  const e = String(raw).trim();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : "INVALID";
}

// Merge an update into the stored override. `undefined` field = leave as-is;
// "" = clear it. Throws on an invalid value so the API can 400.
export function setOverride(name: string, phone?: string | null, email?: string | null): Override {
  const all = readAll();
  const key = normName(name);
  if (!key) throw new Error("A name is required.");
  const prev = all[key] || { name, phone: null, email: null, at: "" };

  let nextPhone = prev.phone;
  if (phone !== undefined) {
    const p = cleanPhone(phone);
    if (p === "INVALID") throw new Error("That phone number doesn't look like 10 digits.");
    nextPhone = p;
  }
  let nextEmail = prev.email;
  if (email !== undefined) {
    const e = cleanEmail(email);
    if (e === "INVALID") throw new Error("That email address doesn't look valid.");
    nextEmail = e;
  }

  const next: Override = { name, phone: nextPhone, email: nextEmail, at: new Date().toISOString() };
  all[key] = next;
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(all, null, 2) + "\n");
  return next;
}
