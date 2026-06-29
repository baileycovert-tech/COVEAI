import { Users, MailOpen } from "lucide-react";
import type { TeamMember } from "../lib/data";

const money = (n: number) => "$" + Math.round(n || 0).toLocaleString();

// Owner's-eye view of the whole sales floor: every rep's month-to-date numbers + COVE lead
// activity, managers flagged. Sorted by the leaderboard rank that getTeam() already applied.
export default function TeamTable({ month, members, totals }: {
  month: string;
  members: TeamMember[];
  totals: { units: number; gross: number; leads: number; reps: number };
}) {
  return (
    <div className="card pad-lg section-gap">
      <div className="card-head">
        <div className="card-title"><span className="ico"><Users /></span>Sales team{month ? ` — ${month}` : ""}</div>
        <span className="muted" style={{ fontSize: 12 }}>
          {totals.reps} people · {totals.units} units · {money(totals.gross)} gross · {totals.leads} COVE lead{totals.leads === 1 ? "" : "s"}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="team-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Salesperson</th>
              <th className="num">Units</th>
              <th className="num">Gross MTD</th>
              <th className="num">Per-unit</th>
              <th className="num">COVE leads</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.slug}>
                <td className="muted">{m.rank ?? "—"}</td>
                <td>
                  {m.name}
                  {m.role === "manager" && <span className="badge amber" style={{ marginLeft: 8, fontSize: 10 }}>mgr</span>}
                  {m.role === "admin" && <span className="badge green" style={{ marginLeft: 8, fontSize: 10 }}>admin</span>}
                </td>
                <td className="num">{m.units}<span className="muted" style={{ fontSize: 11 }}> {m.newU}N/{m.usedU}U</span></td>
                <td className="num">{money(m.gross)}</td>
                <td className="num">{m.units ? money(m.perUnit) : "—"}</td>
                <td className="num">
                  {m.leads > 0
                    ? <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}><MailOpen size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />{m.leads}</span>
                    : <span className="muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stat-sub" style={{ marginTop: 10, fontSize: 11.5 }}>
        COVE leads shows each rep's attributed lead activity — it fills in as reps link their email in Setup. Sales numbers are CRM-attributed from GMReview.
      </div>
    </div>
  );
}
