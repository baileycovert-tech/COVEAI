import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getCustomers, customersFor, getStoreLeads, type Customer } from "../lib/data";
import { PageHead, Avatar } from "../components/ui";
import RepNudge from "../components/RepNudge";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // Plain salespeople: THEIR OWN leads, scoped to them (never anyone else's). Empty → setup nudge.
  if (!me.isAdmin && !me.manager) {
    const mine = customersFor(me);
    if (mine.length === 0) return (<><PageHead title="Customers" sub="Your customers" /><RepNudge what="customers" /></>);
    const hot = mine.filter((c) => c.hot);
    const rest = mine.filter((c) => !c.hot);
    const RCard = ({ c }: { c: Customer }) => (
      <div className="card">
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
        <div className="flex between mt-sm" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
          <span className="badge">{c.source || "Lead"}</span>
          <span>{c.last_touch ? `Opened ${c.last_touch}` : ""}</span>
        </div>
      </div>
    );
    return (
      <>
        <PageHead title="Customers" sub={`Your leads — ${mine.length}${hot.length ? ` · ${hot.length} hot` : ""}`} />
        {hot.length > 0 && (<><div className="nav-label" style={{ margin: "4px 0 10px" }}>Hot</div><div className="grid cols-3">{hot.map((c, i) => <RCard key={i} c={c} />)}</div></>)}
        <div className="nav-label" style={{ margin: "22px 0 10px" }}>Your leads</div>
        <div className="grid cols-3">{rest.map((c, i) => <RCard key={i} c={c} />)}</div>
      </>
    );
  }

  // Bailey: HIS own customer book — with rapport + clickable detail.
  if (me.slug === "bailey-covert") {
    const all = getCustomers();
    const active = all.filter((c) => c.status !== "closed");
    const closed = all.filter((c) => c.status === "closed");
    const hot = active.filter((c) => c.hot);
    const Card = ({ c }: { c: Customer }) => (
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
        <PageHead title="Customers" sub={`Your book — ${active.length} active · ${hot.length} hot · ${closed.length} recently closed`} />
        {hot.length > 0 && (<><div className="nav-label" style={{ margin: "4px 0 10px" }}>Hot</div><div className="grid cols-3">{hot.map((c) => <Card key={c.slug} c={c} />)}</div></>)}
        <div className="nav-label" style={{ margin: "22px 0 10px" }}>Active book</div>
        <div className="grid cols-3">{active.filter((c) => !c.hot).map((c) => <Card key={c.slug} c={c} />)}</div>
        {closed.length > 0 && (<><div className="nav-label" style={{ margin: "22px 0 10px" }}>Recently closed</div><div className="grid cols-3">{closed.map((c) => <Card key={c.slug} c={c} />)}</div></>)}
      </>
    );
  }

  // Managers + owner: the WHOLE floor's working customers as one book.
  const customers = customersFor(me);
  const store = getStoreLeads();
  return (
    <>
      <PageHead
        title="Customers"
        sub={`The whole floor as one book — ${store.activeTotal.toLocaleString()} active customers store-wide (showing the ${customers.length} most recent)`}
      />
      {customers.length === 0 ? (
        <div className="card pad-lg stat-sub">No active customers loaded yet — the store pipeline refresh populates this.</div>
      ) : (
        <div className="card pad-lg">
          <div style={{ overflowX: "auto" }}>
            <table className="team-table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Rep</th><th>Source</th><th>Last touch</th></tr></thead>
              <tbody>
                {customers.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>{c.vehicle_interest || <span className="muted">—</span>}</td>
                    <td className="muted">{c.stage && c.stage !== "floor" ? c.stage : "—"}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{c.source}</td>
                    <td className="muted">{c.last_touch || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
