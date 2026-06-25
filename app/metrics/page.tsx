import { redirect } from "next/navigation";
import { getMetrics, getDeals, monthTotals, money } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, StatCard, UnitsChart, GrossTrend } from "../components/ui";
import { Car, DollarSign, Star, PieChart, ClipboardList, CalendarDays, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

export default function MetricsPage() {
  if (!currentUser()?.isAdmin) redirect("/");
  const months = getMetrics();
  const deals = getDeals();

  const totUnits = months.reduce((n, m) => n + m.newUnits + m.usedUnits, 0);
  const totGross = months.reduce((n, m) => n + monthTotals(m).gross, 0);
  const avgUnits = totUnits / (months.length || 1);
  const bestMonth = [...months].sort((a, b) => monthTotals(b).gross - monthTotals(a).gross)[0];

  const grossPoints = months.map((m) => ({ label: m.label, value: monthTotals(m).gross }));
  const pvrPoints = months.map((m) => {
    const t = monthTotals(m);
    return { label: m.label, value: t.units ? Math.round(t.back / t.units) : 0 };
  });

  // back-gross (F&I) is the steady earner — show its share
  return (
    <>
      <PageHead title="Metrics" sub="9-month performance — units, gross, and F&I trend (live from GMReview)" />

      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units (9 mo)" value={String(totUnits)} sub={`${avgUnits.toFixed(1)} / month avg`} />
        <StatCard ico={<DollarSign />} label="Total gross (9 mo)" value={money(totGross)} sub={`${money(totGross / (months.length || 1))} / month avg`} />
        <StatCard ico={<Star />} label="Best month" value={bestMonth?.label || "—"} sub={`${money(bestMonth ? monthTotals(bestMonth).gross : 0)} gross`} />
        <StatCard ico={<PieChart />} label="New / Used split" value={`${Math.round((months.reduce((n, m) => n + m.newUnits, 0) / totUnits) * 100)}% / ${Math.round((months.reduce((n, m) => n + m.usedUnits, 0) / totUnits) * 100)}%`} sub="of all units" />
      </div>

      <div className="grid cols-2 section-gap">
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 6 }}><span className="ico"><Car /></span>Units by month (new + used)</div>
          <UnitsChart data={months.map((m) => ({ label: m.label, newUnits: m.newUnits, usedUnits: m.usedUnits }))} />
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
            <thead>
              <tr><th>Month</th><th className="num">Units</th><th className="num">Front</th><th className="num">F&I</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {[...months].reverse().map((m) => {
                const t = monthTotals(m);
                return (
                  <tr key={m.month}>
                    <td style={{ fontWeight: 600 }}>{m.label} '{m.month.slice(2, 4)}</td>
                    <td className="num">{t.units}</td>
                    <td className={"num " + (t.front >= 0 ? "pos" : "neg")}>{money(t.front)}</td>
                    <td className="num pos">{money(t.back)}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{money(t.gross)}</td>
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
          <strong>Operator read:</strong> Over 9 months you wrote <strong>{totUnits} units</strong> for <strong>{money(totGross)}</strong> gross. Front-end gross is volatile (and often negative on aggressive new-truck deals), but F&I back-gross is consistently positive — that's the lever a future owner protects. Your volume floor is ~{Math.round(avgUnits)} units/mo; the months you beat it ({months.filter((m) => m.newUnits + m.usedUnits > avgUnits).map((m) => m.label).join(", ")}) are the ones to study.
        </div>
      </div>
    </>
  );
}
