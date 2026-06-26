import { redirect } from "next/navigation";
import { getSold, money } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, LivePill, StatCard } from "../components/ui";
import { Receipt, DollarSign, TrendingUp, Car } from "lucide-react";
import SoldList from "./SoldList";

export const dynamic = "force-dynamic";

export default function SoldPage() {
  if (!currentUser()?.seesFinancials) redirect("/");
  const { deals, totalGross, asOf } = getSold();
  const n = deals.length;
  const avg = n ? Math.round(totalGross / n) : 0;
  const newU = deals.filter((d) => d.nuo === "NEW").length;
  const front = deals.reduce((s, d) => s + d.front, 0);
  const back = deals.reduce((s, d) => s + d.back, 0);

  return (
    <>
      <PageHead title="Sold" sub="Your complete sold-deal history — click any deal for the full breakdown" right={<LivePill text={asOf ? `As of ${asOf}` : "live"} />} />

      {n === 0 ? (
        <div className="card"><div className="callout warn"><span className="ico">⚠️</span> No sold deals loaded yet. The live refresh pulls these from the DMS — they'll appear here on the next successful sync (check <a className="card-link" href="/health">Data Health</a>).</div></div>
      ) : (
        <>
          <div className="grid cols-4">
            <StatCard ico={<Receipt />} label="Deals" value={String(n)} sub={`${newU} new · ${n - newU} used`} />
            <StatCard ico={<DollarSign />} label="Total gross" value={money(totalGross)} sub={`front ${money(front)} · F&I ${money(back)}`} />
            <StatCard ico={<TrendingUp />} label="Avg per deal" value={money(avg)} sub="front + F&I" />
            <StatCard ico={<Car />} label="F&I per deal" value={money(n ? back / n : 0)} sub="back-gross PVR" />
          </div>
          <SoldList deals={deals} />
        </>
      )}
    </>
  );
}
