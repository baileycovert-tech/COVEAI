import Database from "better-sqlite3";
import path from "path";
import { getOverride } from "./overrides";

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
  // A contact Bailey added/corrected on the Contacts page WINS over the static CSV index.
  const ov = name ? getOverride(name) : null;
  if (ov && (ov.phone || ov.email)) return { name: ov.name, phone: ov.phone || "", email: ov.email || "", source: "you added" };
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

// Search the index by name tokens or phone digits — for the Contacts page so Bailey can see
// what number COVE currently has for someone (and correct it).
export function searchContacts(q: string, limit = 30): ContactHit[] {
  if (!db || !q || q.trim().length < 2) return [];
  let rows: ContactHit[] = [];
  try {
    const pn = p10(q);
    const ql = q.toLowerCase().trim();
    if (pn) {
      rows = db.prepare("SELECT name,phone,email,source FROM contacts WHERE phone10=? LIMIT ?").all(pn, limit) as ContactHit[];
    } else if (ql.includes("@")) {
      rows = db.prepare("SELECT name,phone,email,source FROM contacts WHERE LOWER(email) LIKE ? LIMIT ?").all(`%${ql}%`, limit) as ContactHit[];
    } else {
      const terms = ql.replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1);
      if (!terms.length) return [];
      // Each term may match the NAME or the EMAIL, so a remembered email handle typed
      // without the "@" (e.g. "drits175") still finds the contact. Combined with the phone
      // and "@"-email branches above, every contact is findable by name, email, or full phone
      // (incl. the ~23k email-only contacts); contacts that have a phone are listed first.
      const where = terms.map(() => "(LOWER(name) LIKE ? OR LOWER(email) LIKE ?)").join(" AND ");
      const args: string[] = [];
      for (const t of terms) { const w = `%${t}%`; args.push(w, w); }
      rows = db.prepare(
        `SELECT name,phone,email,source FROM contacts WHERE ${where} ORDER BY (phone10!='') DESC, (email!='') DESC LIMIT ?`
      ).all(...args, limit) as ContactHit[];
    }
  } catch {
    rows = [];
  }
  // Overlay any manual correction you've saved, so search shows the up-to-date number/email.
  return rows.map((r) => {
    const ov = getOverride(r.name);
    return ov && (ov.phone || ov.email)
      ? { name: r.name, phone: ov.phone || r.phone || "", email: ov.email || r.email || "", source: "you updated" }
      : r;
  });
}

export const contactsReady = () => !!db;
