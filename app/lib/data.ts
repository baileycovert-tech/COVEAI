import fs from "fs";
import path from "path";

// Data lives in /data at the repo root and is read at request time so a sync
// (or a hand edit) is reflected on the next page load — that's the "live" part.
const DATA_DIR = path.join(process.cwd(), "data");

function read<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, file), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeData(file: string, value: unknown) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(value, null, 2) + "\n");
}

// ---------- Types ----------
export type Deal = {
  date: string; nuo: "NEW" | "USED" | "DEMO"; yr: string; make: string; model: string;
  customer: string; stock: string; front: number; back: number; store: string;
};
export type MonthMetric = {
  month: string; label: string; newUnits: number; usedUnits: number;
  newFront: number; newBack: number; usedFront: number; usedBack: number;
};
export type LeaderRow = { rank: number; name: string; gross: number; isMe: boolean };
export type Customer = {
  slug: string; name: string; phone: string | null; email: string | null;
  vehicle_interest: string; trade: string | null; stage: string; status: string;
  last_touch: string; next_step: string; personal: string; source: string;
  notes: string; hot: boolean;
};
export type PipelineLead = { name: string; vehicle: string; note: string; phone: string };
export type Pipeline = {
  last_refresh: string; standing: string;
  columns: { key: string; title: string; leads: PipelineLead[] }[];
};
export type InvModel = { model: string; units: number; avgMsrp: number; avgDays: number };
export type OutreachDraft = {
  id: string; customer: string; slug: string; channel: "text" | "email";
  subject?: string; body: string; status: "draft" | "approved" | "sent" | "dismissed";
  createdAt: string; rationale?: string; generatedBy: "ai" | "template";
};

// ---------- Loaders ----------
export const getProfile = () => read("profile.json", {} as any);
export const getGoals = () => read("goals.json", { monthlyUnits: 30, monthlyGross: 70000, frontPvrTarget: 1800, fiPvrTarget: 1200, stretchUnits: 50 } as any);
export const getDeals = () => read<Deal[]>("deals.json", []);
export const getMetrics = () => read<{ months: MonthMetric[] }>("metrics.json", { months: [] }).months;
export const getLeaderboard = () => read("leaderboard.json", { rows: [] as LeaderRow[], source: "", asOf: "", scope: "" } as any);
export const getCustomers = () => read<Customer[]>("customers.json", []);
export const getPipeline = () => read<Pipeline>("pipeline.json", { last_refresh: "", standing: "", columns: [] });
export const getInventory = () => read("inventory.json", { asOf: "", ford: [] as InvModel[], chevy: [] as InvModel[] } as any);
export const getOutreachQueue = () => read<OutreachDraft[]>("outreach-queue.json", []);
export type Signal = { at: string; source: string; who: string; summary: string; urgent?: boolean };
export const getSignals = () => read<Signal[]>("signals.json", []);

// Strip phone-number-like patterns from text shown to reps (defense-in-depth so a
// dealership/internal number can never leak into a rep-facing feed).
export const redactPhones = (s: string) =>
  (s || "").replace(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g, "•••");

export type LeadItem = { at: string; source: string; customer: string; vehicle: string; match: string; urgent?: boolean };
export const getLeadFeed = (slug: string) => {
  const all = read<Record<string, LeadItem[]>>("lead-feed.json", {});
  return all[slug] || [];
};

export type RepBoard = { units: number; newU: number; usedU: number; gross: number };
export type LeaderRep = { rank: number; name: string; units: number; gross: number };
export const getReps = () => read("reps.json", { asOf: "", month: "", bySlug: {} as Record<string, RepBoard>, leaderboard: [] as LeaderRep[] } as any);

// ---------- Derived: current-month sales board ----------
export function currentMonthBoard() {
  const months = getMetrics();
  const m = months[months.length - 1];
  const goals = getGoals();
  if (!m) return null;
  const units = m.newUnits + m.usedUnits;
  const newGross = m.newFront + m.newBack;
  const usedGross = m.usedFront + m.usedBack;
  const totalGross = newGross + usedGross;
  const frontTotal = m.newFront + m.usedFront;
  const backTotal = m.newBack + m.usedBack;
  return {
    label: m.label,
    month: m.month,
    units,
    newUnits: m.newUnits,
    usedUnits: m.usedUnits,
    totalGross,
    frontTotal,
    backTotal,
    frontPvr: units ? frontTotal / units : 0,
    fiPvr: units ? backTotal / units : 0,
    unitGoal: goals.monthlyUnits,
    grossGoal: goals.monthlyGross,
    unitPct: Math.min(100, Math.round((units / goals.monthlyUnits) * 100)),
    grossPct: Math.min(100, Math.round((totalGross / goals.monthlyGross) * 100)),
  };
}

export function monthTotals(m: MonthMetric) {
  return {
    units: m.newUnits + m.usedUnits,
    gross: m.newFront + m.newBack + m.usedFront + m.usedBack,
    front: m.newFront + m.usedFront,
    back: m.newBack + m.usedBack,
  };
}

// Match a customer's vehicle-of-interest text against current inventory models.
export function matchInventory(voi: string): (InvModel & { store: string })[] {
  const inv = getInventory();
  const all = [
    ...(inv.ford || []).map((m: InvModel) => ({ ...m, store: "Ford" })),
    ...(inv.chevy || []).map((m: InvModel) => ({ ...m, store: "Chevy" })),
  ];
  const v = (voi || "").toLowerCase();
  if (!v) return [];
  const hits = all.filter((m) => {
    const mk = m.model.toLowerCase();
    if (v.includes(mk)) return true;
    return mk.split(/\s+/).some((tok) => tok.length > 2 && v.includes(tok));
  });
  return hits.sort((a, b) => b.units - a.units).slice(0, 4);
}

export const money = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export const money1 = (n: number) =>
  (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
