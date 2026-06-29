import fs from "fs";
import path from "path";

// Data Health is intentionally honest: every number below is read from the real
// filesystem (file mtime) or from a freshness marker the data itself carries
// (asOf / dataThrough / max date). Nothing here is invented. If a source has not
// refreshed, this view SHOWS that it is stale rather than pretending it is live.

const DATA_DIR = path.join(process.cwd(), "data");
// mcp/deal-mailer lives two levels up from the covert-crm root (see scripts/send.py).
const MAILER_CONFIG = path.join(process.cwd(), "..", "mcp", "deal-mailer", "config.json");

export type SourceStatus = "live" | "stale" | "old" | "unavailable";

export type HealthRow = {
  key: string;
  label: string;
  upstream: string; // where the data actually originates
  refresh: string; // how/how often it is supposed to refresh
  file: string;
  status: SourceStatus;
  lastWritten: string | null; // ISO local of file mtime
  ageLabel: string; // human "12 min ago" / "—"
  asOf: string | null; // freshness marker carried inside the data
  detail: string; // e.g. "31 deals · latest Jun 19"
};

function statMs(file: string): number | null {
  try {
    return fs.statSync(path.join(DATA_DIR, file)).mtimeMs;
  } catch {
    return null;
  }
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function ageLabel(ms: number | null): string {
  if (ms == null) return "—";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h < 24) return rem ? `${h}h ${rem}m ago` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

// Status from age against two thresholds (in minutes). Missing file => unavailable.
function statusFor(ageMs: number | null, freshMin: number, oldMin: number): SourceStatus {
  if (ageMs == null) return "unavailable";
  const min = ageMs / 60000;
  if (min <= freshMin) return "live";
  if (min <= oldMin) return "stale";
  return "old";
}

function fmtLocal(ms: number | null): string | null {
  if (ms == null) return null;
  // Render in the Mac's local time (CRM is single-machine, single-timezone).
  return new Date(ms).toISOString();
}

export function getDataHealth(): { rows: HealthRow[]; now: string } {
  const now = Date.now();

  const row = (
    key: string,
    label: string,
    upstream: string,
    refresh: string,
    file: string,
    freshMin: number,
    oldMin: number,
    asOf: string | null,
    detail: string,
    // Optional: grade status by the data's own marker date (e.g. a wiki last_refresh)
    // instead of the file's write time, so re-saving stale data can't look fresh.
    statusMarker?: string | null
  ): HealthRow => {
    const mt = statMs(file);
    const ageMs = mt == null ? null : now - mt;
    const markerMs = statusMarker ? Date.parse(statusMarker) : NaN;
    const statusAgeMs = Number.isNaN(markerMs) ? ageMs : now - markerMs;
    return {
      key,
      label,
      upstream,
      refresh,
      file,
      status: statusFor(statusAgeMs, freshMin, oldMin),
      lastWritten: fmtLocal(mt),
      ageLabel: ageLabel(ageMs),
      asOf,
      detail,
    };
  };

  // ---- pull a few embedded markers / counts for the detail column ----
  const deals = readJSON<any[]>("deals.json", []);
  const maxDealDate = deals.reduce((mx: string, d: any) => (d?.date > mx ? d.date : mx), "");
  const metrics = readJSON<{ months: any[] }>("metrics.json", { months: [] });
  const latestMonth = metrics.months[metrics.months.length - 1];
  const reps = readJSON<any>("reps.json", { asOf: null, bySlug: {} });
  const repCount = reps.bySlug ? Object.keys(reps.bySlug).length : 0;
  const inv = readJSON<any>("inventory.json", { asOf: null, ford: [], chevy: [] });
  const invUnits =
    (inv.ford || []).reduce((n: number, m: any) => n + (m.units || 0), 0) +
    (inv.chevy || []).reduce((n: number, m: any) => n + (m.units || 0), 0);
  const lb = readJSON<any>("leaderboard.json", { asOf: null, rows: [] });
  const customers = readJSON<any[]>("customers.json", []);
  const pipeline = readJSON<any>("pipeline.json", { last_refresh: null, columns: [] });
  const pipeLeads = (pipeline.columns || []).reduce(
    (n: number, c: any) => n + (c.leads?.length || 0),
    0
  );
  const signals = readJSON<any[]>("signals.json", []);
  const sendLog = readJSON<any[]>("send-log.json", []);

  const rows: HealthRow[] = [
    row(
      "sold-deals",
      "Sold deals (current month)",
      "Drive “JUNE 2026 LOG” sheet + GMReview scorecard_sales",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "deals.json",
      30,
      360,
      maxDealDate ? `latest deal ${maxDealDate}` : null,
      `${deals.length} deals${maxDealDate ? ` · max date ${maxDealDate}` : ""}`
    ),
    row(
      "metrics",
      "Monthly metrics (9-mo trend)",
      "GMReview sales / scorecard tables",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "metrics.json",
      30,
      360,
      latestMonth ? latestMonth.month : null,
      latestMonth
        ? `${metrics.months.length} months · latest ${latestMonth.label} (${
            latestMonth.newUnits + latestMonth.usedUnits
          } units)`
        : "no months"
    ),
    row(
      "reps",
      "All-rep boards (54 logins)",
      "GMReview scorecard_sales (group by rep)",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "reps.json",
      30,
      360,
      reps.asOf || null,
      `${repCount} reps${reps.asOf ? ` · asOf ${reps.asOf}` : ""}`
    ),
    row(
      "inventory",
      "Inventory (Ford + Chevy)",
      "GMReview used_inventory / new-vehicle tables",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "inventory.json",
      60,
      720,
      inv.asOf || null,
      `${invUnits} units in stock${inv.asOf ? ` · asOf ${inv.asOf}` : ""}`
    ),
    row(
      "comms",
      "Customer comms feed",
      "Gmail + iMessage (Messages on this Mac)",
      "DMS refresh engine · every 5 min (store sold + newest leads)",
      "signals.json",
      15,
      120,
      signals[0]?.at || null,
      `${signals.length} signal${signals.length === 1 ? "" : "s"}${
        signals[0]?.at ? ` · newest ${signals[0].at}` : ""
      }`
    ),
    row(
      "leads",
      "Lead feed (per-rep new leads)",
      "GMReview scorecard_leads → inventory match",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "lead-feed.json",
      30,
      360,
      null,
      (() => {
        const lf = readJSON<Record<string, any[]>>("lead-feed.json", {});
        const total = Object.values(lf).reduce((n, a) => n + (a?.length || 0), 0);
        return `${total} routed lead${total === 1 ? "" : "s"} across ${Object.keys(lf).length} reps`;
      })()
    ),
    row(
      "pipeline",
      "Pipeline (live)",
      "GMReview scorecard_leads (Active) + wiki enrichment → build-crm",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "pipeline.json",
      30,
      360,
      pipeline.last_refresh || null,
      `${pipeLeads} leads in pipeline`,
      pipeline.last_refresh || null
    ),
    row(
      "customers",
      "Customers (live)",
      "GMReview scorecard_leads + wiki rapport (union) → build-crm",
      "DMS refresh engine (com.covert.crm-refresh) · every 5 min",
      "customers.json",
      30,
      360,
      null,
      `${customers.length} active customers`
    ),
    row(
      "leaderboard",
      "Group leaderboard (StoneEagle)",
      "StoneEagle COVERT group ranking (manual pull)",
      "Manual — periodic StoneEagle export",
      "leaderboard.json",
      20160, // 14 days fresh — this is a deliberately periodic source
      86400, // 60 days
      lb.asOf || null,
      `${(lb.rows || []).length} ranked${lb.asOf ? ` · asOf ${lb.asOf}` : ""}`,
      lb.asOf || null
    ),
    row(
      "send-log",
      "Outreach send log",
      "Real sends via scripts/send.py (audit)",
      "Written on each approved send",
      "send-log.json",
      100000, // age is not a health signal here; informational only
      100000,
      null,
      `${sendLog.length} send${sendLog.length === 1 ? "" : "s"} logged`
    ),
  ];

  return { rows, now: new Date(now).toISOString() };
}

// Headline freshness for a page's live numbers (the board reads deals/metrics/reps).
// Status reflects the NEWEST of those writes — if even the freshest is old, the
// whole board is old. Used to render an honest pill instead of a static "Live".
export function boardFreshness(
  files: string[] = ["deals.json", "metrics.json", "reps.json"]
): { status: SourceStatus; label: string; lastWritten: string | null } {
  const mtimes = files.map(statMs).filter((x): x is number => x != null);
  if (!mtimes.length) return { status: "unavailable", label: "no data", lastWritten: null };
  const newest = Math.max(...mtimes);
  const ageMs = Date.now() - newest;
  return { status: statusFor(ageMs, 30, 360), label: ageLabel(ageMs), lastWritten: fmtLocal(newest) };
}

// ---- Send / integration readiness (checked, never exercised — no test sends) ----
export type Conn = { key: string; label: string; ok: boolean; detail: string };

export function getConnections(): Conn[] {
  const out: Conn[] = [];

  // Autonomous refresh engine — the launchd cron (com.covert.crm-refresh) that talks
  // straight to the DMS MCP every 5 min. Its heartbeat proves "constant" is actually on.
  const rt = statMs("_refresh-log.json");
  const rlog = readJSON<any>("_refresh-log.json", null);
  if (rt != null && rlog) {
    const age = Date.now() - rt;
    const fresh = age <= 12 * 60000; // a 5-min cron should heartbeat within ~12 min
    const errs = Object.keys(rlog.errors || {});
    out.push({
      key: "refresh-engine",
      label: "Live refresh engine (DMS, autonomous)",
      ok: fresh && errs.length === 0,
      detail: `last run ${ageLabel(age)} · leads ${rlog.ok?.leads ?? "?"}, inventory ${rlog.ok?.inventory ?? "?"} units` +
        (errs.length ? ` · ERRORS: ${errs.join(", ")}` : "") +
        (fresh ? "" : " · STALLED — check launchctl/com.covert.crm-refresh"),
    });
  } else {
    out.push({ key: "refresh-engine", label: "Live refresh engine (DMS, autonomous)", ok: false, detail: "no heartbeat yet — is com.covert.crm-refresh loaded?" });
  }

  // AI drafting (Anthropic) — on if a key is present, else template fallback.
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  out.push({
    key: "anthropic",
    label: "AI outreach drafting",
    ok: hasKey,
    detail: hasKey
      ? `on · model ${process.env.OUTREACH_MODEL || "claude-opus-4-8"}`
      : "ANTHROPIC_API_KEY not set — using template fallback (still works)",
  });

  // iMessage send path — osascript + Messages; we only confirm the bridge exists.
  const sendPy = fs.existsSync(path.join(process.cwd(), "scripts", "send.py"));
  out.push({
    key: "imessage",
    label: "iMessage send bridge",
    ok: sendPy,
    detail: sendPy
      ? "wired · scripts/send.py → osascript (Messages). First send needs macOS Automation grant."
      : "scripts/send.py missing",
  });

  // Gmail send path — reuses deal-mailer app password; check the file + keys only.
  let gmailOk = false;
  let gmailDetail = "deal-mailer config not found";
  try {
    const cfg = JSON.parse(fs.readFileSync(MAILER_CONFIG, "utf8"));
    gmailOk = !!(cfg.gmail_user && cfg.app_password);
    gmailDetail = gmailOk
      ? `wired · Gmail SMTP as ${cfg.gmail_user}`
      : "config present but missing gmail_user / app_password";
  } catch {
    gmailOk = false;
  }
  out.push({ key: "gmail", label: "Gmail send bridge", ok: gmailOk, detail: gmailDetail });

  // Web push (lead alerts).
  const vapid = !!process.env.NEXT_PUBLIC_VAPID_PUBLIC;
  let subs = 0;
  try {
    subs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "push-subs.json"), "utf8")).length || 0;
  } catch {}
  out.push({
    key: "push",
    label: "Web push (lead alerts)",
    ok: vapid,
    detail: vapid ? `VAPID configured · ${subs} device${subs === 1 ? "" : "s"} subscribed` : "VAPID keys not set",
  });

  // Upstream live sources are Claude-managed (the web app can't reach MCP itself).
  out.push({
    key: "gmreview",
    label: "Dealership DB (GMReview)",
    ok: true,
    detail:
      "Claude-managed via scheduled tasks (MCP, not reachable from the web app). Freshness shown per-table above.",
  });
  out.push({
    key: "drive",
    label: "Google Drive month log",
    ok: true,
    detail:
      "Claude-managed via scheduled tasks (MCP). Drives the sold-deal list above; freshness = deals.json age.",
  });

  return out;
}
