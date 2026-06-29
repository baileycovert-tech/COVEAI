import {
  currentMonthBoard, getMetrics, getDeals, getPipeline,
  getCustomers, getProfile, getSignals, getReps, getLeadFeed, getTextLeads, getImsgStatus, redactPhones, monthTotals, money,
} from "./lib/data";
import { boardFreshness } from "./lib/health";
import { currentUser } from "./lib/auth";
import { PageHead, FreshPill, StatCard, UnitsChart, Avatar } from "./components/ui";
import {
  Bell, Car, DollarSign, ClipboardList, Trophy, Radio, BarChart3,
  Flame, ReceiptText, Lightbulb, Megaphone, CarFront, MessageSquare,
} from "lucide-react";

function TextLeadBanner() {
  const status = getImsgStatus();
  const textLeads = getTextLeads();
  if (!textLeads.length) return null;
  const newest = textLeads.slice(0, 3).map((l) => l.name).join(", ");
  return (
    <a href="/pipeline" className="callout" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, textDecoration: "none" }}>
      <span className="ico" style={{ color: "hsl(var(--primary))" }}><MessageSquare size={16} /></span>
      <span><strong>{textLeads.length} lead{textLeads.length === 1 ? "" : "s"} from texts</strong> in your pipeline{newest ? ` — ${newest}${textLeads.length > 3 ? "…" : ""}` : ""}.
        {status?.followups ? ` ${status.followups} follow-up${status.followups === 1 ? "" : "s"} logged.` : ""} <span className="card-link">Open pipeline →</span></span>
    </a>
  );
}

export const dynamic = "force-dynamic";

function sameName(a: string, b: string) {
  const t = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(Boolean);
  const A = t(a), B = t(b);
  return A[0] === B[0] && A[A.length - 1] === B[B.length - 1];
}

function NewLeads({ leads }: { leads: any[] }) {
  if (!leads.length) return null;
  return (
    <div className="card section-gap">
      <div className="card-head">
        <div className="card-title"><span className="ico"><Bell /></span>Your new leads <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— auto-matched to stock</span></div>
        <span className="pill"><span className="dot live" /> live</span>
      </div>
      {leads.slice(0, 6).map((l, i) => (
        <div className="row-item" key={i}>
          <span className="badge hot" style={{ minWidth: 60, justifyContent: "center" }}>NEW</span>
          <div className="row-main">
            <div className="row-title">{l.customer} {l.vehicle && <span className="muted" style={{ fontSize: 12 }}>· {l.vehicle}</span>}</div>
            <div className="row-sub">{redactPhones(l.match)} · via {l.source}</div>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>{(l.at || "").replace("T", " ").slice(5, 16)}</span>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ rows, meName }: { rows: any[]; meName: string }) {
  const top = rows.slice(0, 8);
  const meRow = rows.find((r) => sameName(r.name, meName));
  const showMe = meRow && meRow.rank > 8;
  return (
    <div className="card pad-lg">
      <div className="card-head">
        <div className="card-title"><span className="ico"><Trophy /></span>Group leaderboard</div>
        <span className="muted" style={{ fontSize: 11 }}>June · CRM-attributed gross</span>
      </div>
      {top.map((r) => {
        const me = sameName(r.name, meName);
        return (
          <div className="row-item" key={r.rank}>
            <span className="tag-rank">#{r.rank}</span>
            <Avatar name={r.name} me={me} />
            <div className="row-main">
              <div className="row-title">{r.name}{me && <span className="badge new" style={{ marginLeft: 8 }}>You</span>} <span className="muted" style={{ fontSize: 11 }}>· {r.units}u</span></div>
            </div>
            <div className="num" style={{ fontWeight: 700 }}>{money(r.gross)}</div>
          </div>
        );
      })}
      {showMe && (
        <div className="row-item" style={{ borderTop: "1px dashed hsl(var(--border))", marginTop: 4 }}>
          <span className="tag-rank">#{meRow.rank}</span>
          <Avatar name={meRow.name} me />
          <div className="row-main"><div className="row-title">{meRow.name} <span className="badge new" style={{ marginLeft: 8 }}>You</span> <span className="muted" style={{ fontSize: 11 }}>· {meRow.units}u</span></div></div>
          <div className="num" style={{ fontWeight: 700 }}>{money(meRow.gross)}</div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const me = currentUser();
  const profile = getProfile();
  const reps = getReps();
  const lbRows: any[] = reps.leaderboard || [];
  const myRank = lbRows.find((r) => me && sameName(r.name, me.name));

  const myLeads = me ? getLeadFeed(me.slug) : [];

  // ---------- SALESMAN (no financial access): that rep's own board only ----------
  if (me && !me.seesFinancials) {
    const b = reps.bySlug?.[me.slug];
    const gross = b?.gross ?? 0;
    return (
      <>
        <PageHead
          title={`${me.name.split(" ")[0]}'s Board`}
          sub={`Your month-to-date — ${reps.month || "June 2026"}`}
          right={<FreshPill {...boardFreshness(["reps.json"])} />}
        />
        <NewLeads leads={myLeads} />
        {!b && <div className="callout" style={{ marginBottom: 16 }}><span className="ico"><Megaphone /></span>No CRM-attributed sales recorded yet this month. Walk-ins and repeats can take a day to attribute — your numbers will populate here automatically.</div>}
        <div className="grid cols-4">
          <StatCard ico={<Car />} label="Units MTD" value={String(b?.units ?? 0)} sub={`${b?.newU ?? 0} new / ${b?.usedU ?? 0} used`} />
          <StatCard ico={<DollarSign />} label="Total gross MTD" value={money(gross)} sub="CRM-attributed" />
          <StatCard ico={<ClipboardList />} label="Per-unit gross" value={b && b.units ? money(gross / b.units) : "—"} sub="Avg this month" />
          <StatCard ico={<Trophy />} label="Group rank" value={myRank ? `#${myRank.rank}` : "—"} unit={lbRows.length ? `of ${lbRows.length}` : ""} sub="By CRM-attributed gross" />
        </div>
        <div className="grid cols-2 section-gap">
          <Leaderboard rows={lbRows} meName={me.name} />
          <div className="card pad-lg">
            <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><CarFront /></span>Move the metal</div>
            <div className="lead-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
              Your sold numbers refresh automatically from GMReview. Check <a className="card-link" href="/inventory">Inventory</a> for the freshest stock and the aged units carrying the most markdown — those are your fastest path up the board.
            </div>
            <a className="btn primary mt" href="/inventory">View inventory →</a>
          </div>
        </div>
      </>
    );
  }

  // ---------- ADMIN (Bailey) + MANAGERS: full store board ----------
  // Managers run the floor, so they see the whole STORE's numbers. But they also want THEIR OWN
  // month-to-date, so for managers we show a personal strip above the store board.
  const myStats = me ? reps.bySlug?.[me.slug] : null;
  const showPersonal = !!me?.manager;
  const board = currentMonthBoard();
  const months = getMetrics();
  const signals = getSignals();
  const deals = getDeals();
  const pipeline = getPipeline();
  const customers = getCustomers();
  const prev = months[months.length - 2];
  const unitDelta = board && prev ? board.units - monthTotals(prev).units : 0;
  const recent = [...deals].slice(0, 6);
  const hotLeads = pipeline.columns.find((c) => c.key === "hot")?.leads ?? [];
  // Pipeline leads come from the wiki sync. If that sync is old, these are NOT the
  // current leads — say so on the card instead of presenting stale leads as live.
  const pipeDays = pipeline.last_refresh
    ? Math.floor((Date.now() - new Date(pipeline.last_refresh).getTime()) / 86400000)
    : null;
  const pipeStale = pipeDays != null && pipeDays > 2;
  if (!board) return <div className="empty">No sales data yet.</div>;

  return (
    <>
      <PageHead
        title="Sales Board"
        sub={`Month-to-date — ${profile.currentMonthLabel || board.label} · data through ${(profile.dataThrough || "").slice(5) || "today"}`}
        right={<FreshPill {...boardFreshness()} />}
      />
      <TextLeadBanner />
      <NewLeads leads={myLeads} />

      {showPersonal && (
        <>
          <div className="board-section-label">Your month-to-date</div>
          <div className="grid cols-4" style={{ marginBottom: 18 }}>
            <StatCard ico={<Car />} label="Your units MTD" value={String(myStats?.units ?? 0)} sub={`${myStats?.newU ?? 0} new / ${myStats?.usedU ?? 0} used`} />
            <StatCard ico={<DollarSign />} label="Your gross MTD" value={money(myStats?.gross ?? 0)} sub="CRM-attributed" />
            <StatCard ico={<ClipboardList />} label="Your per-unit" value={myStats && myStats.units ? money(myStats.gross / myStats.units) : "—"} sub="Avg this month" />
            <StatCard ico={<Trophy />} label="Your rank" value={myRank ? `#${myRank.rank}` : "—"} unit={lbRows.length ? `of ${lbRows.length}` : ""} sub="By CRM-attributed gross" />
          </div>
          <div className="board-section-label">Store — month-to-date</div>
        </>
      )}
      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units MTD" value={String(board.units)}
          sub={<><span className={"delta " + (unitDelta >= 0 ? "up" : "down")}>{unitDelta >= 0 ? "▲" : "▼"} {Math.abs(unitDelta)} vs {prev?.label}</span> · {board.newUnits}N / {board.usedUnits}U</>}
          progress={board.unitPct} />
        <StatCard ico={<DollarSign />} label="Total Gross MTD" value={money(board.totalGross)} sub={<>Goal {money(board.grossGoal)} · {board.grossPct}% there</>} progress={board.grossPct} progressGreen />
        <StatCard ico={<ClipboardList />} label="Front PVR" value={money(board.frontPvr)} sub={<>F&I PVR {money(board.fiPvr)} per unit</>} />
        <StatCard ico={<Trophy />} label="Group Rank" value={myRank ? `#${myRank.rank}` : "—"} unit={lbRows.length ? `of ${lbRows.length}` : ""} sub="June · CRM-attributed" />
      </div>

      {signals.length > 0 && (
        <div className="card section-gap">
          <div className="card-head">
            <div className="card-title"><span className="ico"><Radio /></span>Live movement <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— Gmail · Messages · CRM</span></div>
            <span className="pill"><span className="dot live" /> auto</span>
          </div>
          {signals.slice(0, 6).map((s, i) => (
            <div className="row-item" key={i}>
              <span className="badge" style={{ minWidth: 74, justifyContent: "center" }}>{s.source}</span>
              <div className="row-main">
                <div className="row-title">{s.who} {s.urgent && <span className="badge hot" style={{ marginLeft: 6 }}>urgent</span>}</div>
                <div className="row-sub">{s.summary}</div>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{(s.at || "").replace("T", " ").slice(5, 16)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid cols-2 section-gap">
        <div className="card pad-lg">
          <div className="card-head">
            <div className="card-title"><span className="ico"><BarChart3 /></span>Units by month</div>
            <a className="card-link" href="/metrics">All metrics →</a>
          </div>
          <UnitsChart data={months.map((m) => ({ label: m.label, newUnits: m.newUnits, usedUnits: m.usedUnits }))} />
        </div>
        <Leaderboard rows={lbRows} meName={me?.name || "Bailey Covert"} />
      </div>

      <div className="grid cols-2 section-gap">
        <div className="card pad-lg">
          <div className="card-head">
            <div className="card-title"><span className="ico"><Flame /></span>Hot — act now</div>
            <a className="card-link" href="/pipeline">Full pipeline →</a>
          </div>
          {pipeStale && (
            <div className="callout warn" style={{ marginBottom: 12, fontSize: 12 }}>
              These leads are from your last wiki sync ({pipeline.last_refresh}) — {pipeDays} days ago.
              New leads since then aren’t here yet. Run a live refresh from a Claude session with the
              GMReview connector (“refresh my sales board” + scan texts), then <code>npm run sync</code>.
              See <a className="card-link" href="/health">Data Health</a>.
            </div>
          )}
          {hotLeads.length === 0 && <div className="empty">No hot leads flagged.</div>}
          {hotLeads.slice(0, 6).map((l, i) => (
            <div className="row-item" key={i}>
              <Avatar name={l.name} />
              <div className="row-main">
                <div className="row-title">{l.name}</div>
                <div className="row-sub">{l.vehicle ? l.vehicle + " · " : ""}{l.note}</div>
              </div>
              {l.phone && <span className="badge">{l.phone}</span>}
            </div>
          ))}
        </div>
        <div className="card pad-lg">
          <div className="card-head">
            <div className="card-title"><span className="ico"><ReceiptText /></span>Recent deals</div>
            <span className="muted" style={{ fontSize: 11 }}>{deals.length} this month</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Customer</th><th>Vehicle</th><th className="num">Gross</th></tr></thead>
            <tbody>
              {recent.map((d, i) => {
                const g = d.front + d.back;
                return (
                  <tr key={i}>
                    <td className="muted">{d.date.slice(5)}</td>
                    <td style={{ fontWeight: 600 }}>{d.customer}</td>
                    <td>{d.yr} {d.make} {d.model} <span className={"badge " + d.nuo.toLowerCase()} style={{ marginLeft: 4 }}>{d.nuo}</span></td>
                    <td className={"num " + (g >= 0 ? "pos" : "neg")}>{money(g)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card section-gap">
        <div className="callout">
          <span className="ico"><Lightbulb /></span>
          <strong>Coach read:</strong> You closed <strong>{board.units} units</strong> ({board.newUnits} new / {board.usedUnits} used) for {money(board.totalGross)} total gross. You have <strong>{hotLeads.length} hot leads</strong> and <strong>{customers.filter((c) => c.status !== "closed").length} active customers</strong> — work the <a className="card-link" href="/outreach">AI Outreach</a> queue to keep them warm.
        </div>
      </div>
    </>
  );
}
