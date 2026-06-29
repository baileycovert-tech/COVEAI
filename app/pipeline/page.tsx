import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getStoreLeads, getTeam } from "../lib/data";
import { PageHead, LivePill } from "../components/ui";
import RepNudge from "../components/RepNudge";
import { Inbox, Users, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function PipelinePage() {
  const me = currentUser();
  if (!me) redirect("/login");
  // Reps + managers: their own leads (empty until ingested) — never the owner's book.
  if (!me.isAdmin) return (<><PageHead title="Pipeline" sub="Your leads in motion" /><RepNudge what="leads" /></>);

  // Admin / owner: the WHOLE-STORE active-lead pipeline, broken out by rep.
  const store = getStoreLeads();
  const team = getTeam();
  const byRep = team.members
    .filter((m) => m.activeLeads > 0)
    .sort((a, b) => b.activeLeads - a.activeLeads);
  const sources = Object.entries(store.bySource || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <>
      <PageHead
        title="Store pipeline"
        sub={`${store.activeTotal.toLocaleString()} active leads across ${store.reps} reps — click a rep to zoom in`}
        right={<LivePill text={store.asOf ? `As of ${store.asOf}` : "live"} />}
      />

      {store.activeTotal === 0 ? (
        <div className="card pad-lg"><div className="callout warn"><span className="ico">⚠️</span> Store pipeline not loaded yet — the refresh pulls it from GMReview. Run <code>node scripts/store-pipeline-refresh.mjs</code> or wait for the next sync.</div></div>
      ) : (
        <div className="grid cols-2" style={{ alignItems: "start" }}>
          {/* By rep — clickable into each employee */}
          <div className="card pad-lg">
            <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Users /></span>Active leads by rep</div>
            <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
              <table className="team-table">
                <thead><tr><th>Rep</th><th className="num">Active</th><th style={{ width: 24 }}></th></tr></thead>
                <tbody>
                  {byRep.map((m) => (
                    <tr key={m.slug}>
                      <td><Link href={`/team/${m.slug}`} className="team-link">{m.name}</Link>{m.role === "manager" && <span className="badge amber" style={{ marginLeft: 6, fontSize: 10 }}>mgr</span>}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{m.activeLeads}</td>
                      <td className="num"><Link href={`/team/${m.slug}`} className="muted"><ChevronRight size={14} style={{ verticalAlign: "-2px" }} /></Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lead-source mix + recent leads */}
          <div style={{ display: "grid", gap: 18 }}>
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Inbox /></span>Where leads come from</div>
              {sources.map(([s, n]) => (
                <div className="row-item" key={s}>
                  <div className="row-main"><div className="row-title" style={{ fontSize: 13 }}>{s}</div></div>
                  <span className="badge">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Most-recent store-wide leads */}
      {store.leads.length > 0 && (
        <div className="card pad-lg section-gap">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Inbox /></span>Newest leads — store-wide <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(most recent {store.leads.length})</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="team-table">
              <thead><tr><th>Customer</th><th>Rep</th><th>Vehicle</th><th>Source</th><th>Opened</th></tr></thead>
              <tbody>
                {store.leads.slice(0, 120).map((l, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{l.customer || "—"}</td>
                    <td className="muted">{l.rep}</td>
                    <td>{l.vehicle || <span className="muted">—</span>}</td>
                    <td className="muted" style={{ fontSize: 12 }}>{l.source}</td>
                    <td className="muted">{l.at}</td>
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
