import fs from "fs";
import path from "path";
import { lookupContact } from "./contacts";
import { getOverride } from "./overrides";

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
export type InvUnit = { stock: string; vin: string; year: number; make?: string; model: string; trim: string; ext: string; int: string; price: number | null; internet?: number | null; mileage?: number | null; age: number; status: string; store: string; condition?: string };
export const getInventoryUnits = () =>
  read<{ asOf: string; source: string; units: InvUnit[] }>("inventory-units.json", { asOf: "", source: "", units: [] });
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

// iMessage ingestion outputs
export type TextLead = { slug: string; name: string; phone: string | null; vehicle: string; source: string; stock: string | null; at: string; lastMsg: string; hot: boolean; channel: string };
export const getTextLeads = () => read<TextLead[]>("imessage-leads.json", []);
export const getImsgStatus = () => read<any>("imessage-status.json", null);
export type ThreadMsg = { at: string; text: string; dir: string };
export const getThread = (slug: string) => {
  const all = read<Record<string, ThreadMsg[]>>("imessage-threads.json", {});
  return all[slug] || [];
};
// A text-lead's thread may be keyed by its imsg-slug even after it merges into an
// existing customer record — match by slug, name, OR phone so it always links.
export const getThreadForCustomer = (c: { slug: string; name?: string; phone?: string | null }) => {
  const all = read<Record<string, ThreadMsg[]>>("imessage-threads.json", {});
  const kb = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const p10 = (s: string) => (String(s || "").match(/\d/g) || []).join("").slice(-10);
  const keys = [c.slug, "imsg-" + kb(c.name || ""), c.phone ? "imsg-" + p10(c.phone) : ""].filter(Boolean);
  for (const k of keys) if (all[k]?.length) return all[k];
  return [] as ThreadMsg[];
};

// Morning-brief signals: the latest INBOUND message per thread, recent first. A thread is
// "waiting" if the customer sent the last message (Bailey owes a reply) and "moving" if that
// message shows buying intent (price/financing/trade/test-drive/a question) — manual §3.
export type BriefSignal = { name: string; slug: string; at: string; text: string; channel: string; waiting: boolean; moving: boolean };
const MOVING_RE = /\?|\bprice\b|financ|payment|trade|test ?drive|come (in|by)|how much|interested|when can|available|still (have|there|in)/i;
export function getBriefSignals(maxAgeDays = 7, limit = 12): BriefSignal[] {
  const threads = read<Record<string, (ThreadMsg & { channel?: string })[]>>("imessage-threads.json", {});
  const nameBySlug: Record<string, string> = {};
  for (const c of getCustomers()) nameBySlug[c.slug] = c.name;
  for (const t of getTextLeads()) nameBySlug[t.slug] ||= t.name;
  const cutoff = Date.now() - maxAgeDays * 86400000;
  const out: BriefSignal[] = [];
  for (const [slug, msgs] of Object.entries(threads)) {
    const inbound = (msgs || []).filter((m) => m.dir === "in");
    if (!inbound.length) continue;
    const lastIn = inbound[inbound.length - 1];
    const at = lastIn.at || "";
    if (at && new Date(at).getTime() < cutoff) continue;
    out.push({
      name: nameBySlug[slug] || slug.replace(/^(imsg|gmail|vs)-/, ""),
      slug, at, text: (lastIn.text || "").slice(0, 140),
      channel: msgs.some((m) => m.channel === "email") ? "email" : "iMessage",
      waiting: msgs[msgs.length - 1]?.dir === "in",
      moving: MOVING_RE.test(lastIn.text || ""),
    });
  }
  return out.sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, limit);
}

export type SoldDeal = {
  id: string; date: string; deal: number; customer: string; stock: string; vin: string;
  nuo: string; store: string; year: number | null; make: string | null; model: string | null;
  front: number; back: number; gross: number; msrp: number | null; trade: number | null;
  bank: string | null; daysInStock: string | null;
};
export const getSold = () =>
  read<{ asOf: string; source: string; count: number; totalGross: number; deals: SoldDeal[] }>(
    "sold.json", { asOf: "", source: "", count: 0, totalGross: 0, deals: [] });

const normName = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

// Unified outreach audience = the SAME live lead feed the board shows, merged with
// the wiki customer pages. New CRM leads appear here automatically (so Outreach stays
// in sync with everything else that's updating); existing wiki customers keep their
// full record (contact info + rapport). Leads dedupe into a matching customer page.
export function getOutreachTargets(repSlug = "bailey-covert"): Customer[] {
  const customers = getCustomers().filter((c) => c.status !== "closed");
  const seen = new Set(customers.map((c) => normName(c.name)));
  const usedSlugs = new Set(customers.map((c) => c.slug));
  const leadTargets: Customer[] = [];

  for (const l of getLeadFeed(repSlug)) {
    const key = normName(l.customer);
    if (!l.customer || !key || seen.has(key)) continue; // already a customer page
    seen.add(key);
    let slug = "lead-" + key.replace(/\s+/g, "-");
    while (usedSlugs.has(slug)) slug += "-2";
    usedSlugs.add(slug);
    leadTargets.push({
      slug,
      name: l.customer,
      phone: null,
      email: null,
      vehicle_interest: l.vehicle || "",
      trade: null,
      stage: "new lead",
      status: "active",
      last_touch: l.at || "",
      // Keep next_step blank so the message body stays customer-safe in template mode;
      // the lead context lives in `notes`/`source` for the AI prompt + the UI.
      next_step: "",
      personal: "",
      source: l.source || "CRM",
      notes: `New ${l.source || "CRM"} lead. ${l.match || ""}`.trim(),
      hot: !!l.urgent,
    });
  }
  // Resolve contact info, highest-trust first:
  //  1) a manual override Bailey typed on the Outreach page (contact-overrides.json)
  //  2) his 35k contacts index (contacts.db)
  const all = [...leadTargets, ...customers];
  for (const c of all) {
    const ov = getOverride(c.name);
    if (ov) {
      if (ov.phone) c.phone = ov.phone;
      if (ov.email) c.email = ov.email;
    }
    if (c.phone && c.email) continue;
    const hit = lookupContact(c.name, c.phone);
    if (hit) {
      if (!c.phone && hit.phone) c.phone = hit.phone;
      if (!c.email && hit.email) c.email = hit.email;
    }
  }
  // Live leads first (freshest), then existing customers.
  return all;
}

// ---------- Per-rep data isolation ----------
// COVE's customer / pipeline / contact book is currently one personal book (Bailey's) with no
// rep attribution, so it must never appear on another rep's login. Rule: admins (Bailey + the
// owner) see the full book; every other rep sees ONLY their own slug-attributed leads — which is
// empty until their own texts/email ingest. This is what keeps one rep's customers off another's.
export type Viewer = { slug: string; isAdmin: boolean } | null;

function leadFeedAsCustomers(slug: string): Customer[] {
  return getLeadFeed(slug).map((l, i) => ({
    slug: "lead-" + i + "-" + (l.customer || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: l.customer || "Lead", phone: null, email: null,
    vehicle_interest: l.vehicle || "", trade: null,
    stage: l.urgent ? "hot" : "new lead", status: "active",
    last_touch: l.at || "", next_step: "", personal: "", source: l.source || "CRM",
    notes: l.match || "", hot: !!l.urgent,
  }));
}

export const customersFor = (me: Viewer): Customer[] =>
  me?.isAdmin ? getCustomers() : me ? leadFeedAsCustomers(me.slug) : [];

export function pipelineFor(me: Viewer): Pipeline {
  if (me?.isAdmin) return getPipeline();
  const cust = me ? leadFeedAsCustomers(me.slug) : [];
  const toLead = (c: Customer): PipelineLead => ({ name: c.name, vehicle: c.vehicle_interest, note: c.source, phone: c.phone || "" });
  return { last_refresh: "", standing: "", columns: [
    { key: "hot", title: "Hot", leads: cust.filter((c) => c.hot).map(toLead) },
    { key: "working", title: "Working", leads: cust.filter((c) => !c.hot).map(toLead) },
    { key: "warm", title: "Warm", leads: [] },
  ] };
}

export const outreachTargetsFor = (me: Viewer): Customer[] =>
  me?.isAdmin ? getOutreachTargets("bailey-covert")
    : me ? leadFeedAsCustomers(me.slug).filter((c) => c.status !== "closed") : [];

export type RepBoard = { units: number; newU: number; usedU: number; gross: number };
export type LeaderRep = { rank: number; name: string; units: number; gross: number };
export const getReps = () => read("reps.json", { asOf: "", month: "", bySlug: {} as Record<string, RepBoard>, leaderboard: [] as LeaderRep[] } as any);

// ---------- Owner view: the whole sales team, numbers + COVE lead activity + role ----------
export type TeamMember = {
  rank: number | null; name: string; slug: string; role: "rep" | "manager" | "admin";
  units: number; newU: number; usedU: number; gross: number; perUnit: number; leads: number;
  activeLeads: number;  // store-wide active CRM leads attributed to this person
};

// ---------- Whole-store active-lead pipeline (owner/admin view) ----------
export type StoreLead = { customer: string; rep: string; source: string; status: string; vehicle: string; stock: string; at: string; lastTouch: string };
export type StoreLeads = { asOf: string; activeTotal: number; reps: number; byRep: Record<string, { active: number; touched3d: number }>; bySource: Record<string, number>; leads: StoreLead[] };
export const getStoreLeads = (): StoreLeads =>
  read("store-leads.json", { asOf: "", activeTotal: 0, reps: 0, byRep: {}, bySource: {}, leads: [] } as StoreLeads);

// scorecard rep names ("Kwami Wilborn") vs COVE names ("Kwami Na'Jae Wilborn") reconcile on
// first + last token, so the CRM pipeline lines up with the sales roster.
const repTokens = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !["jr", "sr", "ii", "iii", "iv"].includes(t));
export function repNameMatches(a: string, b: string): boolean {
  const ta = repTokens(a), tb = repTokens(b);
  if (!ta.length || !tb.length) return false;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}
export function storeActiveFor(name: string): { active: number; touched3d: number } {
  for (const [rep, v] of Object.entries(getStoreLeads().byRep)) if (repNameMatches(rep, name)) return v;
  return { active: 0, touched3d: 0 };
}
export function storeLeadsFor(name: string): StoreLead[] {
  return getStoreLeads().leads.filter((l) => repNameMatches(l.rep, name));
}
// The exact CRM rep name (e.g. "Kwami Wilborn") for a COVE person, for a live per-rep lead query.
export function storeRepName(name: string): string | null {
  for (const rep of Object.keys(getStoreLeads().byRep)) if (repNameMatches(rep, name)) return rep;
  return null;
}
export function getTeam(): { month: string; members: TeamMember[]; totals: { units: number; newU: number; usedU: number; gross: number; leads: number; reps: number } } {
  const reps = getReps();
  const bySlug: Record<string, RepBoard> = reps.bySlug || {};
  const leaderboard: LeaderRep[] = reps.leaderboard || [];
  const users: any[] = read("users.json", [] as any[]);
  const csvByRep: Record<string, number> = read("csv-rep-leads.json", { byRep: {} } as any).byRep || {};

  const norm = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
  const slugify = (s: string) => norm(s).replace(/\s+/g, "-");
  const roleOf = (slug: string): "rep" | "manager" | "admin" => {
    const u = users.find((x) => x.slug === slug);
    return u?.isAdmin ? "admin" : u?.manager ? "manager" : "rep";
  };
  // COVE lead activity per rep: VinSolutions attribution (by name) + each rep's scraped inbox (by slug).
  const leadByName: Record<string, number> = {};
  for (const [name, n] of Object.entries(csvByRep)) leadByName[norm(name)] = (leadByName[norm(name)] || 0) + (n as number);
  const inboxBySlug: Record<string, number> = {};
  try {
    const dir = path.join(DATA_DIR, "rep-inbox");
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try { inboxBySlug[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")).length || 0; } catch {}
    }
  } catch {}

  const storeByRep = getStoreLeads().byRep;
  const activeFor = (nm: string) => { for (const [rep, v] of Object.entries(storeByRep)) if (repNameMatches(rep, nm)) return v.active; return 0; };

  const seen = new Set<string>();
  const members: TeamMember[] = leaderboard.map((r) => {
    const slug = slugify(r.name);
    seen.add(slug);
    const b = bySlug[slug] || { units: r.units, newU: 0, usedU: 0, gross: r.gross };
    const leads = (leadByName[norm(r.name)] || 0) + (inboxBySlug[slug] || 0);
    return { rank: r.rank, name: r.name, slug, role: roleOf(slug),
      units: r.units, newU: b.newU || 0, usedU: b.usedU || 0, gross: r.gross,
      perUnit: r.units ? Math.round(r.gross / r.units) : 0, leads, activeLeads: activeFor(r.name) };
  });
  // Managers / staff with no attributed sales this month still belong on the owner's roster.
  for (const u of users) {
    if (seen.has(u.slug) || u.isAdmin) continue;
    if (!u.manager) continue; // only surface managers without sales; reps without sales are inactive noise
    members.push({ rank: null, name: u.name, slug: u.slug, role: "manager",
      units: 0, newU: 0, usedU: 0, gross: 0, perUnit: 0, leads: (inboxBySlug[u.slug] || 0), activeLeads: activeFor(u.name) });
  }

  const totals = members.reduce((a, m) => ({ units: a.units + m.units, newU: a.newU + m.newU, usedU: a.usedU + m.usedU, gross: a.gross + m.gross, leads: a.leads + m.leads, reps: a.reps + 1 }), { units: 0, newU: 0, usedU: 0, gross: 0, leads: 0, reps: 0 });
  return { month: reps.month || "", members, totals };
}

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
