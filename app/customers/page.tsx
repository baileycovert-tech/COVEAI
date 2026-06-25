import Link from "next/link";
import { redirect } from "next/navigation";
import { getCustomers } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, Avatar } from "../components/ui";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  if (!currentUser()?.isAdmin) redirect("/");
  const all = getCustomers();
  const active = all.filter((c) => c.status !== "closed");
  const closed = all.filter((c) => c.status === "closed");
  const hot = active.filter((c) => c.hot);

  const Card = ({ c }: { c: (typeof all)[number] }) => (
    <Link href={`/customers/${c.slug}`} className="card" style={{ display: "block" }}>
      <div className="flex between">
        <div className="flex gap-sm">
          <Avatar name={c.name} />
          <div>
            <div className="row-title">{c.name}</div>
            <div className="row-sub" style={{ maxWidth: 260 }}>{c.vehicle_interest || "—"}</div>
          </div>
        </div>
        {c.hot && <span className="badge hot">Hot</span>}
      </div>
      <div className="lead-note" style={{ marginTop: 10 }}>{c.notes || c.next_step}</div>
      <div className="flex between mt-sm" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
        <span className="badge">{c.stage || "Lead"}</span>
        <span>Next: {c.next_step ? c.next_step.slice(0, 38) : "—"}</span>
      </div>
    </Link>
  );

  return (
    <>
      <PageHead
        title="Customers"
        sub={`${active.length} active · ${hot.length} hot · ${closed.length} recently closed`}
      />

      {hot.length > 0 && (
        <>
          <div className="nav-label" style={{ margin: "4px 0 10px" }}>Hot</div>
          <div className="grid cols-3">{hot.map((c) => <Card key={c.slug} c={c} />)}</div>
        </>
      )}

      <div className="nav-label" style={{ margin: "22px 0 10px" }}>Active book</div>
      <div className="grid cols-3">{active.filter((c) => !c.hot).map((c) => <Card key={c.slug} c={c} />)}</div>

      {closed.length > 0 && (
        <>
          <div className="nav-label" style={{ margin: "22px 0 10px" }}>Recently closed</div>
          <div className="grid cols-3">{closed.map((c) => <Card key={c.slug} c={c} />)}</div>
        </>
      )}
    </>
  );
}
