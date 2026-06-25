"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { SoldDeal } from "../lib/data";

const money = (n: number) => (n < 0 ? "-" : "") + "$" + Math.abs(Math.round(n)).toLocaleString("en-US");

export default function SoldList({ deals }: { deals: SoldDeal[] }) {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "NEW" | "USED">("all");
  const [limit, setLimit] = useState(40);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return deals.filter((d) => {
      if (scope !== "all" && d.nuo !== scope) return false;
      if (!terms.length) return true;
      const hay = `${d.customer} ${d.stock} ${d.vin} ${d.year || ""} ${d.make || ""} ${d.model || ""} ${d.deal} ${d.store} ${d.bank || ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [deals, q, scope]);

  const Chip = ({ on, onClick, children }: any) => (
    <button onClick={onClick} className="pill" style={{ cursor: "pointer", border: on ? "1px solid hsl(var(--primary))" : undefined, color: on ? "hsl(var(--primary))" : undefined }}>{children}</button>
  );

  return (
    <div className="card pad-lg section-gap">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="card-title"><span className="ico"><Search /></span>Every deal</div>
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} of {deals.length}</span>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 12, top: 11, color: "hsl(var(--faint))" }}><Search size={16} /></span>
        <input className="field" style={{ paddingLeft: 36 }} placeholder="Search customer, stock #, VIN, vehicle, deal #…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(40); }} />
      </div>
      <div className="flex wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Chip on={scope === "all"} onClick={() => setScope("all")}>All</Chip>
        <Chip on={scope === "NEW"} onClick={() => setScope("NEW")}>New</Chip>
        <Chip on={scope === "USED"} onClick={() => setScope("USED")}>Used</Chip>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Customer</th><th>Vehicle</th><th>Stock</th><th className="num">Front</th><th className="num">F&I</th><th className="num">Total</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((d) => (
              <tr key={d.id} style={{ cursor: "pointer" }}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}><Link href={`/sold/${d.id}`}>{d.date?.slice(5) || "—"}</Link></td>
                <td style={{ fontWeight: 600 }}><Link href={`/sold/${d.id}`}>{d.customer}</Link></td>
                <td><Link href={`/sold/${d.id}`}>{[d.year, d.make, d.model].filter(Boolean).join(" ") || "—"} <span className={"badge " + (d.nuo === "NEW" ? "new" : "used")} style={{ marginLeft: 4 }}>{d.nuo}</span></Link></td>
                <td className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>{d.stock}</td>
                <td className={"num " + (d.front >= 0 ? "pos" : "neg")}>{money(d.front)}</td>
                <td className="num pos">{money(d.back)}</td>
                <td className={"num " + (d.gross >= 0 ? "pos" : "neg")} style={{ fontWeight: 700 }}>{money(d.gross)}</td>
                <td><Link href={`/sold/${d.id}`} className="card-link">details →</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="empty">No deals match “{q}”.</div>}
      {filtered.length > limit && (
        <button className="btn ghost sm" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => setLimit((l) => l + 60)}>
          Show {Math.min(60, filtered.length - limit)} more
        </button>
      )}
    </div>
  );
}
