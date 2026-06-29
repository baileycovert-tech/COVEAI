import fs from "fs";
import path from "path";

// Deal-jacket workflow store. A "jacket" is one sold deal moving through approval gates:
//   ready → at_desk (sent to desking for approval) → at_finance (forwarded to F&I) → done (funded).
// Persisted to data/ (gitignored — holds customer PII + deal numbers). The running instance owns
// the file; git tracks code only.
const DATA = path.join(process.cwd(), "data");
const FILE = path.join(DATA, "deal-jackets.json");
const ROUTING = path.join(DATA, "deal-routing.json");

export type Stage = "ready" | "at_desk" | "at_finance" | "done";
export type Party = { first_name?: string; last_name?: string; address?: string; city?: string; state?: string; zip?: string; phone?: string; email?: string; dob?: string; dl_number?: string };
export type Veh = { year?: string | number; make?: string; model?: string; vin?: string; stock?: string; color?: string; miles?: string | number };
export type DealJacket = {
  id: string;
  createdAt: string;
  createdBy: string;            // rep slug
  type: "new" | "used";
  customer: Party;
  vehicle: Veh;
  trade?: Veh;
  dealNumber: string;
  pdfPath: string;              // absolute path to the filled packet
  pdfName: string;
  stage: Stage;
  desk: string;                 // alias/email the desk copy goes to
  finance: string;              // alias/email the finance copy goes to
  history: { at: string; event: string }[];
};

export type Routing = { desk: string; finance: string };
const DEFAULT_ROUTING: Routing = { desk: "evan", finance: "johnny" };

function readAll(): DealJacket[] {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return []; }
}
function writeAll(rows: DealJacket[]) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, 2) + "\n");
}

export function getRouting(): Routing {
  try { return { ...DEFAULT_ROUTING, ...JSON.parse(fs.readFileSync(ROUTING, "utf8")) }; }
  catch { return { ...DEFAULT_ROUTING }; }
}
export function setRouting(r: Partial<Routing>): Routing {
  const next = { ...getRouting(), ...r };
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(ROUTING, JSON.stringify(next, null, 2) + "\n");
  return next;
}

// Admins see every jacket; reps see only their own.
export function listJackets(repSlug: string, isAdmin: boolean): DealJacket[] {
  const rows = readAll().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return isAdmin ? rows : rows.filter((r) => r.createdBy === repSlug);
}
export function getJacket(id: string): DealJacket | null {
  return readAll().find((r) => r.id === id) || null;
}
export function createJacket(j: DealJacket) {
  const rows = readAll();
  rows.push(j);
  writeAll(rows);
  return j;
}
export function updateJacket(id: string, patch: Partial<DealJacket>, event?: string): DealJacket | null {
  const rows = readAll();
  const i = rows.findIndex((r) => r.id === id);
  if (i < 0) return null;
  rows[i] = { ...rows[i], ...patch };
  if (event) rows[i].history = [...(rows[i].history || []), { at: new Date().toISOString(), event }];
  writeAll(rows);
  return rows[i];
}
export function deleteJacket(id: string): boolean {
  const rows = readAll();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  writeAll(next);
  return true;
}
