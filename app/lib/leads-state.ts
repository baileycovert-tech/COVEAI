import fs from "fs";
import path from "path";

// Per-lead board overrides, keyed by normalized name so they survive the nightly rebuild.
//   "remove" = Bailey clicked it out.   "keep" = never auto-remove (e.g. a sold-name collision
//   that's actually still a live lead — restore wins over the sold match).
// build-crm reads this + the sold log, removes accordingly, and writes removed-leads.json
// (the list it actually dropped, with a reason) which the /pipeline "Removed" section shows.
const OVERRIDES = path.join(process.cwd(), "data", "lead-overrides.json");
const REMOVED = path.join(process.cwd(), "data", "removed-leads.json");

const normName = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

export type RemovedLead = { name: string; reason: string; at?: string };

function readOverrides(): Record<string, "remove" | "keep"> {
  try { return JSON.parse(fs.readFileSync(OVERRIDES, "utf8")); } catch { return {}; }
}

export function setOverride(name: string, mode: "remove" | "keep" | null): void {
  const all = readOverrides();
  const key = normName(name);
  if (!key) return;
  if (mode) all[key] = mode;
  else delete all[key];
  fs.mkdirSync(path.dirname(OVERRIDES), { recursive: true });
  fs.writeFileSync(OVERRIDES, JSON.stringify(all, null, 2) + "\n");
}

// What build-crm actually dropped (clicked-out + sold), for the Removed section.
export function getRemoved(): RemovedLead[] {
  try {
    const list = JSON.parse(fs.readFileSync(REMOVED, "utf8")) as RemovedLead[];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}
