import { getInventory, getInventoryUnits, money } from "../lib/data";
import { PageHead, LivePill, StatCard } from "../components/ui";
import { Car, DollarSign, Clock, Package, Target } from "lucide-react";
import InventorySearch from "./InventorySearch";

export const dynamic = "force-dynamic";

type Row = { model: string; units: number; avgMsrp: number; avgDays: number };

function Table({ title, rows, tone }: { title: string; rows: Row[]; tone: "ford" | "chevy" }) {
  const units = rows.reduce((n, r) => n + r.units, 0);
  return (
    <div className="card pad-lg">
      <div className="card-head">
        <div className="card-title">
          <span className={"badge " + tone} style={{ marginRight: 8 }}>{tone === "ford" ? "Ford" : "Chevy"}</span>
          {title}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{units} units</span>
      </div>
      <table>
        <thead>
          <tr><th>Model</th><th className="num">Units</th><th className="num">Avg MSRP</th><th className="num">Avg days</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.model}>
              <td style={{ fontWeight: 600 }}>{r.model}</td>
              <td className="num">{r.units}</td>
              <td className="num">{money(r.avgMsrp)}</td>
              <td className="num">{r.avgDays}</td>
              <td className="num">
                {r.avgDays >= 120
                  ? <span className="badge aged">Aged</span>
                  : r.avgDays <= 30
                  ? <span className="badge green">Fresh</span>
                  : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InventoryPage() {
  const inv = getInventory();
  const ford: Row[] = inv.ford || [];
  const chevy: Row[] = inv.chevy || [];
  const all = [...ford, ...chevy];
  const totalUnits = all.reduce((n, r) => n + r.units, 0);
  const aged = all.filter((r) => r.avgDays >= 120).sort((a, b) => b.avgDays - a.avgDays);
  const totalValue = all.reduce((n, r) => n + r.units * r.avgMsrp, 0);
  const units = getInventoryUnits().units;
  const usedCount = units.filter((u) => u.store === "Used").length;
  const newCount = units.length - usedCount;

  return (
    <>
      <PageHead
        title="Inventory"
        sub={`Hutto new + used (all makes) — search any stock, VIN, color, or trim`}
        right={<LivePill text={`As of ${inv.asOf}`} />}
      />

      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units in stock" value={String(units.length)} sub={`${newCount} new · ${usedCount} used`} />
        <StatCard ico={<DollarSign />} label="Inventory value" value={money(totalValue)} sub="At average MSRP" />
        <StatCard ico={<Clock />} label="Aged lines (120+ days)" value={String(aged.length)} sub="Spiff / move-it candidates" />
        <StatCard ico={<Package />} label="Deepest line" value={[...all].sort((a, b) => b.units - a.units)[0]?.model || "—"} sub={`${[...all].sort((a, b) => b.units - a.units)[0]?.units || 0} in stock`} />
      </div>

      {aged.length > 0 && (
        <div className="card section-gap">
          <div className="callout">
            <span className="ico"><Target /></span>
            <strong>Aged-unit play:</strong> {aged.slice(0, 4).map((r) => `${r.model} (${r.avgDays}d avg)`).join(", ")} are sitting longest. These usually carry the most dealer markdown/spiff — lead with them when a customer is flexible on trim, and pitch the floor-plan savings to your manager to win the discount.
          </div>
        </div>
      )}

      {units.length > 0 && <InventorySearch units={units} />}

      <div className="grid cols-2 section-gap">
        <Table title="New inventory by model" rows={ford} tone="ford" />
        <Table title="New inventory by model" rows={chevy} tone="chevy" />
      </div>
    </>
  );
}
