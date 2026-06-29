import Link from "next/link";
import { Users, Inbox, ChevronRight } from "lucide-react";
import type { TeamMember } from "../lib/data";

const money = (n: number) => "$" + Math.round(n || 0).toLocaleString();

// Owner's-eye view of the whole sales floor: every rep's month-to-date numbers + their active CRM
// pipeline. Each row links to that employee's zoom-in page. Sorted by leaderboard rank.
export default function TeamTable({ month, members, totals }: {
  month: string;
  members: TeamMember[];
  totals: { units: number; gross: number; leads: number; reps: number };
}) {
  const storeActive = members.reduce((n, m) => n + (m.activeLeads || 0), 0);
  return (
    <div className="card pad-lg section-gap">
      <div className="card-head">
        <div className="card-title"><span className="ico"><Users /></span>Sales team{month ? ` — ${month}` : ""}</div>
        <span className="muted" style={{ fontSize: 12 }}>
          {totals.reps} people · {totals.units} units · {money(totals.gross)} gross · {storeActive.toLocaleString()} active leads
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="team-table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th>Employee</th>
              <th className="num">Units</th>
              <th className="num">Gross MTD</th>
              <th className="num">Per-unit</th>
              <th className="num">Active leads</th>
              <th style={{ width: 28 }}></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.slug} className="team-row">
                <td className="muted">{m.rank ?? "—"}</td>
                <td>
                  <Link href={`/team/${m.slug}`} className="team-link">{m.name}</Link>
                  {m.role === "manager" && <span className="badge amber" style={{ marginLeft: 8, fontSize: 10 }}>mgr</span>}
                  {m.role === "admin" && <span className="badge green" style={{ marginLeft: 8, fontSize: 10 }}>admin</span>}
                </td>
                <td className="num">{m.units}<span className="muted" style={{ fontSize: 11 }}> {m.newU}N/{m.usedU}U</span></td>
                <td className="num">{money(m.gross)}</td>
                <td className="num">{m.units ? money(m.perUnit) : "—"}</td>
                <td className="num">
                  {m.activeLeads > 0
                    ? <span style={{ color: "hsl(var(--primary))", fontWeight: 600 }}><Inbox size={12} style={{ verticalAlign: "-2px", marginRight: 3 }} />{m.activeLeads}</span>
                    : <span className="muted">—</span>}
                </td>
                <td className="num"><Link href={`/team/${m.slug}`} className="muted" aria-label={`Open ${m.name}`}><ChevronRight size={15} style={{ verticalAlign: "-3px" }} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="stat-sub" style={{ marginTop: 10, fontSize: 11.5 }}>
        Click any employee to zoom into their numbers + active leads. Active leads = the live GMReview CRM pipeline; sales are CRM-attributed.
      </div>
    </div>
  );
}
