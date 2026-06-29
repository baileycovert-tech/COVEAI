import { redirect } from "next/navigation";
import { getSold, money, getTeam } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, LivePill, StatCard } from "../components/ui";
import { Receipt, DollarSign, TrendingUp, Car } from "lucide-react";
import SoldList from "./SoldList";
import RepNumbers from "../components/RepNumbers";
import TeamTable from "../components/TeamTable";

export const dynamic = "force-dynamic";

export default function SoldPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  const first = me.name.split(/\s+/)[0];
  const isBailey = me.slug === "bailey-covert"; // sold.json is HIS deal-level history

  // Salesperson AND manager: their OWN sold numbers (from reps.json by their S1) — never a store
  // dump or someone else's deals. Only the owner/admin sees everyone.
  if (!me.isAdmin) {
    return (<><PageHead title="Sold" sub={`Your sold numbers this month, ${first}`} /><RepNumbers slug={me.slug} name={me.name} /></>);
  }

  // Owner/admin: their own + the whole store, every rep broken out.
  const team = getTeam();
  const t = team.totals;

  return (
    <>
      <PageHead title="Sold" sub="Your numbers, the store total, and every rep's sold" right={<LivePill text="live" />} />

      <div className="board-section-label">Your sold — month-to-date</div>
      <RepNumbers slug={me.slug} name={me.name} />

      <div className="board-section-label" style={{ marginTop: 20 }}>Store — everyone, {team.month || "this month"}</div>
      <div className="grid cols-4">
        <StatCard ico={<Receipt />} label="Store units" value={String(t.units)} sub={`${t.newU} new · ${t.usedU} used · ${t.reps} sellers`} />
        <StatCard ico={<DollarSign />} label="Store gross" value={money(t.gross)} sub="CRM-attributed, all reps" />
        <StatCard ico={<TrendingUp />} label="Avg per unit" value={t.units ? money(Math.round(t.gross / t.units)) : "—"} sub="across the floor" />
        <StatCard ico={<Car />} label="Sellers" value={String(t.reps)} sub="with attributed sales" />
      </div>
      <TeamTable month={team.month} members={team.members} totals={team.totals} />

      {/* Bailey's own deal-level history (sold.json is his) — shown only to him. */}
      {isBailey && <BaileyDeals />}
    </>
  );
}

function BaileyDeals() {
  const { deals, totalGross, asOf } = getSold();
  if (!deals.length) return null;
  const n = deals.length;
  const avg = n ? Math.round(totalGross / n) : 0;
  const newU = deals.filter((d) => d.nuo === "NEW").length;
  const front = deals.reduce((s, d) => s + d.front, 0);
  const back = deals.reduce((s, d) => s + d.back, 0);
  return (
    <>
      <div className="board-section-label" style={{ marginTop: 20 }}>Your deal history{asOf ? ` — as of ${asOf}` : ""}</div>
      <div className="grid cols-4">
        <StatCard ico={<Receipt />} label="Deals" value={String(n)} sub={`${newU} new · ${n - newU} used`} />
        <StatCard ico={<DollarSign />} label="Total gross" value={money(totalGross)} sub={`front ${money(front)} · F&I ${money(back)}`} />
        <StatCard ico={<TrendingUp />} label="Avg per deal" value={money(avg)} sub="front + F&I" />
        <StatCard ico={<Car />} label="F&I per deal" value={money(n ? back / n : 0)} sub="back-gross PVR" />
      </div>
      <SoldList deals={deals} />
    </>
  );
}
