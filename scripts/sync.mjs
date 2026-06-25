#!/usr/bin/env node
/**
 * Covert CRM sync — refreshes the file-based layer of the CRM.
 *
 * What this script can do on its own (plain Node, no API access):
 *   1. Parse wiki/customers/active/*.md  -> data/customers.json  (merged, non-destructive)
 *   2. Parse wiki/pipeline.md header     -> data/pipeline.json    (standing + last refresh)
 *   3. Stamp data/profile.json lastSync
 *
 * What it CANNOT do (needs the GMReview CRM connector, which only Claude can call):
 *   - Refresh deals.json / metrics.json / inventory.json / leaderboard.json
 *   For those, ask Claude in chat: "refresh my sales board" and it re-runs the live
 *   CRM queries and rewrites those JSON files. This script leaves them untouched.
 *
 * Usage:  npm run sync
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const WIKI = path.resolve(ROOT, "..", "wiki");

const readJson = (f, fb) => { try { return JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")); } catch { return fb; } };
const writeJson = (f, v) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v, null, 2) + "\n");
const today = new Date().toISOString().slice(0, 10);

function field(md, label) {
  const re = new RegExp(`\\*\\*${label}:?\\*\\*\\s*([^\\n]+)`, "i");
  const m = md.match(re);
  if (!m) return "";
  let v = m[1].trim().replace(/^[:\-\s]+/, "").trim();
  if (/^_?unknown_?$/i.test(v) || v === "—" || v === "-") return "";
  return v;
}

function parseCustomers() {
  const dir = path.join(WIKI, "customers", "active");
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  const out = [];
  for (const f of files) {
    const md = fs.readFileSync(path.join(dir, f), "utf8");
    const slug = f.replace(/\.md$/, "");
    const title = (md.match(/^#\s+(.+)$/m) || [, slug])[1].trim();
    const name = title.split("—")[0].split(" - ")[0].trim();
    const stage = field(md, "Stage");
    const next = field(md, "Next step") || field(md, "Next");
    out.push({
      slug,
      name,
      phone: field(md, "Phone") || null,
      email: field(md, "Email") || null,
      vehicle_interest: field(md, "Vehicle interest") || field(md, "Vehicle") || title.split("—").slice(1).join("—").trim(),
      trade: field(md, "Trade") || null,
      stage: stage || "Working",
      status: "active",
      last_touch: field(md, "Last touch") || "",
      next_step: next || "",
      personal: field(md, "Personal") || "",
      source: field(md, "Source") || "",
      notes: "",
      hot: /appointment|signing|test drive|near close|hot/i.test(stage + " " + next),
    });
  }
  return out;
}

function merge(existing, parsed) {
  // Keep richer existing fields (e.g. notes the subagent distilled); overlay fresh wiki values.
  const bySlug = new Map(existing.map((c) => [c.slug, c]));
  for (const p of parsed) {
    const cur = bySlug.get(p.slug) || {};
    bySlug.set(p.slug, {
      ...cur,
      ...Object.fromEntries(Object.entries(p).filter(([k, v]) => v !== "" && v != null)),
      // never lose a distilled summary
      notes: cur.notes || p.notes || "",
      hot: p.hot || cur.hot || false,
    });
  }
  return [...bySlug.values()];
}

function refreshPipelineHeader() {
  const pj = readJson("pipeline.json", null);
  if (!pj) return false;
  const pmPath = path.join(WIKI, "pipeline.md");
  if (!fs.existsSync(pmPath)) return false;
  const md = fs.readFileSync(pmPath, "utf8");
  const refresh = (md.match(/\*\*Last refresh:\*\*\s*([0-9-]+)/i) || [])[1];
  const standing = (md.match(/units MTD[^.\n]*/i) || [])[0];
  if (refresh) pj.last_refresh = refresh;
  if (standing) pj.standing = standing.trim();
  writeJson("pipeline.json", pj);
  return true;
}

// ---- run ----
console.log("⟳ Covert CRM sync");
const parsed = parseCustomers();
if (parsed.length) {
  const merged = merge(readJson("customers.json", []), parsed);
  writeJson("customers.json", merged);
  console.log(`  ✓ customers.json — ${merged.length} records (${parsed.length} from wiki)`);
} else {
  console.log("  • no wiki/customers/active pages found — customers.json left as-is");
}

console.log(refreshPipelineHeader() ? "  ✓ pipeline.json header refreshed" : "  • pipeline header not refreshed");

const profile = readJson("profile.json", {});
profile.lastSync = today;
writeJson("profile.json", profile);
console.log(`  ✓ profile.json lastSync = ${today}`);

console.log("Done. For live deals/metrics/inventory, ask Claude: \"refresh my sales board\".");
