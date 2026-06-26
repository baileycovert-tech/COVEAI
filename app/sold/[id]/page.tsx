import { redirect } from "next/navigation";
import Link from "next/link";
import { getSold, money } from "../../lib/data";
import { currentUser } from "../../lib/auth";
import { PageHead } from "../../components/ui";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export default function SoldDetail({ params }: { params: { id: string } }) {
  if (!currentUser()?.seesFinancials) redirect("/");
  const d = getSold().deals.find((x) => x.id === params.id);
  if (!d) return (
    <div className="card"><div className="empty">Deal {params.id} not found. <Link className="card-link" href="/sold">← Back to Sold</Link></div></div>
  );

  const vehicle = [d.year, d.make, d.model].filter(Boolean).join(" ") || "Vehicle";
  const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="row-item"><div className="row-main"><div className="row-sub">{label}</div></div><div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div></div>
  );

  return (
    <>
      <Link href="/sold" className="card-link" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 12 }}><ArrowLeft size={14} /> All sold deals</Link>
      <PageHead title={d.customer} sub={`${vehicle} · sold ${d.date} · deal #${d.deal}`} right={<span className={"badge " + (d.nuo === "NEW" ? "new" : "used")}>{d.nuo}</span>} />

      <div className="grid cols-2">
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 6 }}>Gross</div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 8 }}>
            <div><div className="stat-label">Front</div><div className={"stat-value " + (d.front >= 0 ? "pos" : "neg")} style={{ fontSize: 22 }}>{money(d.front)}</div></div>
            <div><div className="stat-label">F&I</div><div className="stat-value pos" style={{ fontSize: 22 }}>{money(d.back)}</div></div>
            <div><div className="stat-label">Total</div><div className={"stat-value " + (d.gross >= 0 ? "pos" : "neg")} style={{ fontSize: 22 }}>{money(d.gross)}</div></div>
          </div>
        </div>
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 6 }}>Deal</div>
          <Row label="Store" value={d.store} />
          <Row label="Stock #" value={d.stock || "—"} />
          <Row label="VIN" value={<span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>{d.vin || "—"}</span>} />
          <Row label="MSRP" value={d.msrp ? money(d.msrp) : "—"} />
          <Row label="Trade ACV" value={d.trade ? money(d.trade) : "—"} />
          <Row label="Days in stock" value={d.daysInStock || "—"} />
          <Row label="Lender" value={d.bank || "—"} />
        </div>
      </div>
    </>
  );
}
