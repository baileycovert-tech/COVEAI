import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { currentUser } from "../../lib/auth";
import { getTeam, storeActiveFor, storeRepName, storeLeadsFor, money, type StoreLead } from "../../lib/data";
import { dmsQuery } from "../../lib/dms";
import { PageHead, StatCard } from "../../components/ui";
import { Car, DollarSign, ClipboardList, Trophy } from "lucide-react";

export const dynamic = "force-dynamic";

// Live-pull this rep's full active-lead list (the stored sample only holds the most recent 500
// store-wide). Falls back to the sample if the DMS is unreachable.
async function repLeads(name: string): Promise<StoreLead[]> {
  const repName = storeRepName(name);
  if (!repName) return storeLeadsFor(name);
  const safe = repName.replace(/'/g, "''");
  try {
    const rows: any[] = await dmsQuery(
      `SELECT customer, lead_source AS source, lead_status_custom AS status, year, make, model, trim,
              stock_number AS stock, lead_origination_date::text AS at, last_attempted_or_actual::text AS last_touch
       FROM scorecard_leads
       WHERE sales_rep = '${safe}' AND lead_status_type = 'Active'
       ORDER BY lead_origination_date DESC LIMIT 200`
    );
    return rows.map((r) => ({
      customer: r.customer || "", rep: repName, source: /ask the question/i.test(r.source || "") ? "CRM" : (r.source || "CRM"),
      status: r.status || "Active", vehicle: [r.year, r.make, r.model, r.trim].filter(Boolean).join(" ").trim(),
      stock: r.stock || "", at: (r.at || "").slice(0, 10), lastTouch: (r.last_touch || "").slice(0, 10),
    }));
  } catch {
    return storeLeadsFor(name);
  }
}

export default async function EmployeePage({ params }: { params: { slug: string } }) {
  const me = currentUser();
  if (!me) redirect("/login");
  if (!me.isAdmin) redirect("/");
  const team = getTeam();
  const m = team.members.find((x) => x.slug === params.slug);
  if (!m) return notFound();
  const active = storeActiveFor(m.name);
  const leads = await repLeads(m.name);
  const rankN = team.members.filter((x) => x.rank).length;

  return (
    <>
      <PageHead
        title={m.name}
        sub={`${m.role === "manager" ? "Sales manager" : m.role === "admin" ? "Owner / admin" : "Salesperson"} · ${team.month}`}
        right={<Link className="btn" href="/team">← All employees</Link>}
      />

      <div className="board-section-label">Sales — month-to-date</div>
      <div className="grid cols-4">
        <StatCard ico={<Car />} label="Units MTD" value={String(m.units)} sub={`${m.newU}N / ${m.usedU}U`} />
        <StatCard ico={<DollarSign />} label="Gross MTD" value={money(m.gross)} sub="CRM-attributed" />
        <StatCard ico={<ClipboardList />} label="Per-unit" value={m.units ? money(m.perUnit) : "—"} sub="avg this month" />
        <StatCard ico={<Trophy />} label="Group rank" value={m.rank ? `#${m.rank}` : "—"} unit={rankN ? `of ${rankN}` : ""} sub="by gross" />
      </div>

      <div className="board-section-label" style={{ marginTop: 20 }}>
        Active leads <span className="muted" style={{ textTransform: "none", fontWeight: 400 }}>— {active.active} in the pipeline · {active.touched3d} touched in the last 3 days</span>
      </div>
      {leads.length === 0 ? (
        <div className="card pad-lg stat-sub">No active leads found for {m.name.split(" ")[0]} in the CRM.</div>
      ) : (
        <div className="card pad-lg">
          <div style={{ overflowX: "auto" }}>
            <table className="team-table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Source</th><th>Opened</th><th>Last touch</th></tr></thead>
              <tbody>
                {leads.map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.customer || "—"}</td>
                    <td>{l.vehicle || <span className="muted">—</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{l.source}</td>
                    <td className="muted">{l.at}</td>
                    <td className="muted">{l.lastTouch || "—"}</td>
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
