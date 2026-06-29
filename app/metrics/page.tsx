import { redirect } from "next/navigation";
import { getMetrics, monthTotals, money, getTeam } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, StatCard, UnitsChart, GrossTrend } from "../components/ui";
import RepNumbers from "../components/RepNumbers";
import TeamTable from "../components/TeamTable";
import { Car, DollarSign, ClipboardList, CalendarDays, Lightbulb, MailOpen } from "lucide-react";

export const dynamic = "force-dynamic";

export default function MetricsPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  const first = me.name.split(/\s+/)[0];
  const isBailey = me.slug === "bailey-covert"; // the 9-month trend below is HIS personal history

  // Salesperson: just their own numbers.
  if (!me.seesFinancials) {
    return (<><PageHead title="Metrics" sub={`Your numbers this month, ${first}`} /><RepNumbers slug={me.slug} name={me.name} /></>);
  }

  // Managers + owner: their own + the STORE's numbers (the team aggregate — never one rep's book).
  const team = getTeam();
  const t = team.totals;

  return (
    <>
      <PageHead title="Metrics" sub={me.isAdmin ? "Store performance + every rep's numbers" : `Your numbers + store performance, ${first}`} />

      <div className="board-section-label">Your month-to-date</div>
      <RepNumbers slug={me.slug} name={me.name} />

      <div className="board-section-label" style={{ marginTop: 20 }}>Store — {team.month || "this month"}</div>
      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Store units MTD" value={String(t.units)} sub={`${t.newU}N / ${t.usedU}U · ${t.reps} sellers`} />
        <StatCard ico={<DollarSign />} label="Store gross MTD" value={money(t.gross)} sub="CRM-attributed, all reps" />
        <StatCard ico={<ClipboardList />} label="Store per-unit" value={t.units ? money(t.gross / t.units) : "—"} sub="Avg across the floor" />
        <StatCard ico={<MailOpen />} label="COVE leads" value={String(t.leads)} sub="Attributed lead activity" />
      </div>

      {/* The owner sees every rep broken out; managers see the store aggregate only. */}
      {me.isAdmin && <TeamTable month={team.month} members={team.members} totals={team.totals} />}

      {/* Bailey's personal 9-month trend — his own history, shown only to him. */}
      {isBailey && <BaileyTrend />}
    </>
  );
}

function BaileyTrend() {
  const months = getMetrics();
  if (!months.length) return null;
  const totUnits = months.reduce((n: number, m: any) => n + m.newUnits + m.usedUnits, 0);
  const totGross = months.reduce((n: number, m: any) => n + monthTotals(m).gross, 0);
  const avgUnits = totUnits / (months.length || 1);
  const grossPoints = months.map((m: any) => ({ label: m.label, value: monthTotals(m).gross }));
  const pvrPoints = months.map((m: any) => { const tt = monthTotals(m); return { label: m.label, value: tt.units ? Math.round(tt.back / tt.units) : 0 }; });

  return (
    <>
      <div className="board-section-label" style={{ marginTop: 20 }}>Your {months.length}-month trend</div>
      <div className="grid cols-2 section-gap" style={{ marginTop: 0 }}>
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 6 }}><span className="ico"><Car /></span>Units by month (new + used)</div>
          <UnitsChart data={months.map((m: any) => ({ label: m.label, newUnits: m.newUnits, usedUnits: m.usedUnits }))} />
        </div>
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><DollarSign /></span>Total gross trend</div>
          <GrossTrend points={grossPoints} />
        </div>
      </div>
      <div className="grid cols-2 section-gap">
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><ClipboardList /></span>F&I per unit (back-gross PVR)</div>
          <GrossTrend points={pvrPoints} />
          <div className="stat-sub">F&I is your steadiest gross — front swings month to month, but back-end PVR is the floor under your paycheck.</div>
        </div>
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><CalendarDays /></span>Month-by-month detail</div>
          <table>
            <thead><tr><th>Month</th><th className="num">Units</th><th className="num">Front</th><th className="num">F&I</th><th className="num">Total</th></tr></thead>
            <tbody>
              {[...months].reverse().map((m: any) => {
                const tt = monthTotals(m);
                return (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.label} &apos;{m.month.slice(2, 4)}</td>
                    <td className="num">{tt.units}</td>
                    <td className={"num " + (tt.front >= 0 ? "pos" : "neg")}>{money(tt.front)}</td>
                    <td className="num pos">{money(tt.back)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(tt.gross)}</td>
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
          <strong>Operator read:</strong> Over {months.length} months you wrote <strong>{totUnits} units</strong> for <strong>{money(totGross)}</strong> gross. Front-end gross is volatile (and often negative on aggressive new-truck deals), but F&I back-gross is consistently positive — that&apos;s the lever a future owner protects. Your volume floor is ~{Math.round(avgUnits)} units/mo.
        </div>
      </div>
    </>
  );
}
