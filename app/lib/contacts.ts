import Database from "better-sqlite3";
import path from "path";

// Read-only lookup over data/contacts.db (built by scripts/build-contacts.mjs from
// Bailey's ~35k contacts). Fills in a phone/email the CRM record is missing.
// Singleton connection — opened once per server process.
let db: any = null;
try {
  db = new Database(path.join(process.cwd(), "data", "contacts.db"), { readonly: true, fileMustExist: true });
} catch {
  db = null;
}

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "md", "dds"]);
const nameKey = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z, ]/g, " ").replace(/,/g, " ")
    .split(/\s+/).filter((t) => t.length > 1 && !SUFFIX.has(t)).sort().join(" ").trim();
const p10 = (s: string) => { const d = (String(s || "").match(/\d/g) || []).join(""); return d.length >= 10 ? d.slice(-10) : ""; };

export type ContactHit = { name: string; phone: string; email: string; source: string };

// Find a contact by exact phone first (most reliable), then by order-independent name key.
export function lookupContact(name?: string | null, phone?: string | null): ContactHit | null {
  if (!db) return null;
  try {
    const pn = p10(phone || "");
    if (pn) {
      const r = db.prepare("SELECT name,phone,email,source FROM contacts WHERE phone10=? LIMIT 1").get(pn);
      if (r) return r;
    }
    const key = nameKey(name || "");
    if (!key) return null;
    return (
      db.prepare("SELECT name,phone,email,source FROM contacts WHERE key=? AND phone10!='' LIMIT 1").get(key) ||
      db.prepare("SELECT name,phone,email,source FROM contacts WHERE key=? AND email!='' LIMIT 1").get(key) ||
      null
    );
  } catch {
    return null;
  }
}

export const contactsReady = () => !!db;
