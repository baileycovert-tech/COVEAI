import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { customersFor, getStoreLeads } from "../lib/data";
import { PageHead } from "../components/ui";
import RepNudge from "../components/RepNudge";

export const dynamic = "force-dynamic";

export default function CustomersPage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // Plain salespeople: their own. Managers + owner: the WHOLE floor's working customers as one book.
  if (!me.isAdmin && !me.manager) return (<><PageHead title="Customers" sub="Your customers" /><RepNudge what="customers" /></>);

  const customers = customersFor(me);   // floor-wide working deals
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
