import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import {
  currentMonthBoard, getPipeline, getBriefSignals, getProfile, getReps, money,
} from "../lib/data";
import { PageHead, StatCard } from "../components/ui";
import { Sun, Flame, MessageSquare, Mail, ListChecks, Car, DollarSign, Target, Lightbulb, UserCog } from "lucide-react";

export const dynamic = "force-dynamic";

// The "future-owner" operator prompt — rotates deterministically by day so it's stable per-day.
const OPERATOR_QS = [
  "What's the F&I back-gross PVR on your last 5 deals — and which product drove it?",
  "Which aged unit on the lot is costing the most in floorplan interest right now?",
  "Of your sold deals this month, how many were repeat or referral vs. fresh leads?",
  "What's the gross difference between a new-truck deal and a used-truck deal for you this month?",
  "Which lead source is converting best for you — and are you working it hardest?",
  "What would change about how you desk a deal if you owned the store?",
];

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function BriefPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  const sees = me.seesFinancials;
  const profile = getProfile();

  // DATA ISOLATION: the captured texts/leads belong to the capture owner (admin). Other reps
  // see only THEIR own numbers (from reps.json, scoped by their slug) — never someone else's
  // book. Their lead feed populates from the DMS by their S1 once access is restored.
  const isOwner = me.isAdmin;
  const board = currentMonthBoard();
  const myBoard = getReps().bySlug?.[me.slug];
  const pipe = getPipeline();
  const signals = isOwner ? getBriefSignals(7, 14) : [];

  const hot = isOwner ? (pipe.columns.find((c) => c.key === "hot")?.leads ?? []) : [];
  const working = isOwner ? (pipe.columns.find((c) => c.key === "working")?.leads ?? []) : [];
  const needsTouch = [...hot, ...working].slice(0, 8);

  // Pace math (uses today's date; calendar-day approximation for selling days).
  const now = new Date();
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - day;
  // Scorecard numbers: owner = store board, rep = their own sold-log board.
  const units = isOwner ? (board?.units ?? 0) : (myBoard?.units ?? 0);
  const newU = isOwner ? (board?.newUnits ?? 0) : (myBoard?.newU ?? 0);
  const usedU = isOwner ? (board?.usedUnits ?? 0) : (myBoard?.usedU ?? 0);
  const gross = isOwner ? (board?.totalGross ?? 0) : (myBoard?.gross ?? 0);
  const fiPvr = isOwner ? (board?.fiPvr ?? 0) : (myBoard && myBoard.units ? Math.round(myBoard.gross / myBoard.units) : 0);
  const perDay = day ? units / day : 0;
  const projected = Math.round(perDay * daysInMonth);
  const goal = (isOwner ? board?.unitGoal : 0) || 15;
  const gap = Math.max(0, goal - units);

  const imsg = signals.filter((s) => s.channel === "iMessage");
  const email = signals.filter((s) => s.channel === "email");
  const waiting = signals.filter((s) => s.waiting);

  // Plate: who to work first — waiting+moving signals, then fresh hot leads.
  const plate: string[] = [];
  for (const s of signals.filter((s) => s.waiting && s.moving)) plate.push(`Reply to ${s.name} — “${s.text.slice(0, 60)}”`);
  for (const l of hot.slice(0, 4)) if (!plate.some((p) => p.includes(l.name))) plate.push(`First contact: ${l.name}${l.vehicle ? ` — ${l.vehicle}` : ""}`);
  for (const s of signals.filter((s) => s.waiting && !s.moving)) if (!plate.some((p) => p.includes(s.name))) plate.push(`Follow up with ${s.name}`);
  const fname = me.name.split(/\s+/)[0];
  const operatorQ = OPERATOR_QS[now.getDate() % OPERATOR_QS.length];

  return (
    <>
      <PageHead title={`Good morning, ${fname}`} sub={fmtDate(now)} right={<span className="pill"><Sun size={13} /> Morning brief</span>} />

      {/* Scorecard */}
      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units MTD" value={String(units)} sub={`${newU}N / ${usedU}U · pace ${perDay.toFixed(1)}/day`} />
        <StatCard ico={<Target />} label="Projected" value={String(projected)} sub={`${daysLeft} selling days left`} />
        <StatCard ico={<Flame />} label="Gap to goal" value={String(gap)} sub={`goal ${goal} units`} />
        {sees ? (
          <StatCard ico={<DollarSign />} label={isOwner ? "Gross MTD" : "Your gross MTD"} value={money(gross)} sub={`F&I PVR ${money(fiPvr)}`} />
        ) : (
          <StatCard ico={<ListChecks />} label="Needs touch" value={String(needsTouch.length)} sub={`${hot.length} need first contact`} />
        )}
      </div>

      {/* Reps: until their own lead sources are connected, point them to setup instead of
          showing someone else's book. */}
      {!isOwner && (
        <div className="card pad-lg section-gap">
          <div className="callout">
            <span className="ico"><UserCog /></span>
            <div>
              <strong>Connect your leads to COVE</strong>
              <div className="stat-sub" style={{ marginTop: 4 }}>
                Your numbers above are yours. To pull your <strong>own</strong> text/email leads onto this brief,
                add your phone and email in <a className="card-link" href="/setup">Setup</a>. Your DMS leads populate
                automatically from your employee number once live access is restored.
              </div>
              <a className="btn primary mt" href="/setup"><UserCog size={15} /> Finish my setup</a>
            </div>
          </div>
        </div>
      )}

      {/* New / needs-touch leads */}
      <div className="card pad-lg section-gap">
        <div className="card-head">
          <div className="card-title"><span className="ico"><Flame /></span>Active leads needing touch</div>
          <a className="card-link" href="/pipeline">Full pipeline →</a>
        </div>
        {needsTouch.length === 0 ? (
          <div className="empty">Caught up — no open leads waiting.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Customer</th><th>Vehicle</th><th className="hide-sm">Next step</th><th></th></tr></thead>
              <tbody>
                {needsTouch.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                    <td>{l.vehicle || <span className="muted">—</span>}</td>
                    <td className="hide-sm"><span className="muted" style={{ fontSize: 12 }}>{l.note || "Make first contact"}</span></td>
                    <td className="num">{l.phone ? <a className="card-link" href={`/outreach?slug=${encodeURIComponent((l as any).slug || "")}`}>Draft</a> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Signals: iMessage + Gmail */}
      <div className="grid cols-2 section-gap">
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><MessageSquare /></span>iMessage signals <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {waiting.length} awaiting your reply</span></div>
          {imsg.length === 0 ? <div className="empty">No recent text signals.</div> : imsg.slice(0, 8).map((s, i) => (
            <div className="row-item" key={i}>
              <div className="row-main">
                <div className="row-title">{s.name} {s.moving && <span className="badge hot" style={{ marginLeft: 6 }}>moving</span>} {s.waiting && <span className="badge amber" style={{ marginLeft: 4 }}>waiting</span>}</div>
                <div className="row-sub">“{s.text}”</div>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{(s.at || "").slice(5, 10)}</span>
            </div>
          ))}
        </div>
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Mail /></span>Gmail signals</div>
          {email.length === 0 ? <div className="empty">No recent email signals. <span className="muted">(Lead-dump CSVs flow in once attachment access is on.)</span></div> : email.slice(0, 8).map((s, i) => (
            <div className="row-item" key={i}>
              <div className="row-main">
                <div className="row-title">{s.name} {s.moving && <span className="badge hot" style={{ marginLeft: 6 }}>moving</span>}</div>
                <div className="row-sub">“{s.text}”</div>
              </div>
              <span className="muted" style={{ fontSize: 11 }}>{(s.at || "").slice(5, 10)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Plate for today */}
      <div className="card pad-lg section-gap">
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><ListChecks /></span>Plate for today</div>
        {plate.length === 0 ? <div className="empty">Nothing urgent queued. Work the aged units and prospect.</div> : (
          <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
            {plate.slice(0, 8).map((p, i) => <li key={i}>{p}</li>)}
          </ol>
        )}
      </div>

      {/* Operator question */}
      <div className="card section-gap">
        <div className="callout">
          <span className="ico"><Lightbulb /></span>
          <strong>Operator question:</strong> {operatorQ}
        </div>
      </div>

      <div className="muted" style={{ fontSize: 11, marginTop: 12 }}>
        Renders from your live ingest (texts, email, leads, pace). Pace/board from last DMS sync
        {profile.dataThrough ? ` (through ${String(profile.dataThrough).slice(5)})` : ""}.
      </div>
    </>
  );
}
