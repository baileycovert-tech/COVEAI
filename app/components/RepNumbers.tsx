import { getReps, money } from "../lib/data";
import { StatCard } from "./ui";
import { Car, DollarSign, ClipboardList, Trophy } from "lucide-react";

const sameName = (a: string, b: string) =>
  (a || "").toLowerCase().replace(/[^a-z]/g, "") === (b || "").toLowerCase().replace(/[^a-z]/g, "");

// A rep's OWN month, from reps.json (units/gross/new/used) — units, gross, average, pace, rank.
export default function RepNumbers({ slug, name }: { slug: string; name: string }) {
  const reps = getReps();
  const b = reps.bySlug?.[slug];
  const rank = (reps.leaderboard || []).find((r: any) => sameName(r.name, name));
  const units = b?.units ?? 0;
  const gross = b?.gross ?? 0;
  const day = new Date().getDate();
  const perDay = day ? (units / day).toFixed(1) : "0";

  return (
    <>
      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units MTD" value={String(units)} sub={`${b?.newU ?? 0}N / ${b?.usedU ?? 0}U · ${perDay}/day`} />
        <StatCard ico={<DollarSign />} label="Your gross MTD" value={money(gross)} sub="CRM-attributed" />
        <StatCard ico={<ClipboardList />} label="PVR per unit" value={units ? money(Math.round(gross / units)) : "—"} sub={units ? `Front ${money(Math.round((b?.front || 0) / units))} · F&I ${money(Math.round((b?.back || 0) / units))}` : "front + F&I"} />
        <StatCard ico={<Trophy />} label="Group rank" value={rank ? `#${rank.rank}` : "—"} unit={(reps.leaderboard || []).length ? `of ${(reps.leaderboard || []).length}` : ""} sub={reps.month || "this month"} />
      </div>
      {!b && (
        <div className="callout" style={{ marginTop: 16 }}>
          <span className="ico">📊</span>
          <div className="stat-sub">No CRM-attributed sales recorded for you yet this month — walk-ins/repeats can take a day to attribute. Full deal history + monthly trend show here once the live DMS connection is restored.</div>
        </div>
      )}
    </>
  );
}
