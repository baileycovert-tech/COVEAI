import { redirect } from "next/navigation";
import { currentUser } from "../lib/auth";
import { getDataHealth, getConnections, type SourceStatus } from "../lib/health";
import { PageHead } from "../components/ui";
import { CheckCircle2, Moon, AlertTriangle, Radio, Plug, Lightbulb } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS: Record<SourceStatus, { label: string; badge: string; dot: string }> = {
  live: { label: "Live", badge: "badge green", dot: "dot live" },
  stale: { label: "Stale", badge: "badge amber", dot: "dot amber" },
  old: { label: "Not refreshing", badge: "badge aged", dot: "dot red" },
  unavailable: { label: "Unavailable", badge: "badge grey", dot: "dot off" },
};

function fmt(iso: string | null): string {
  if (!iso) return "—";
  // Show local wall-clock for the Mac running the CRM.
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function HealthPage() {
  if (!currentUser()?.isAdmin) redirect("/");

  const { rows, now } = getDataHealth();
  const conns = getConnections();

  const counts = rows.reduce(
    (acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc),
    {} as Record<SourceStatus, number>
  );
  const liveSources = rows.filter((r) => ["send-log"].indexOf(r.key) === -1); // exclude the audit log from health math
  const nLive = liveSources.filter((r) => r.status === "live").length;
  const nProblem = liveSources.filter((r) => r.status === "old" || r.status === "unavailable").length;
  const allStale = liveSources.every((r) => r.status !== "live");

  // Honest top banner — reflects the actual state of the refresh pipeline.
  let banner: { cls: string; ico: React.ReactNode; text: React.ReactNode };
  if (nProblem === 0 && nLive > 0 && !allStale) {
    banner = {
      cls: "callout",
      ico: <CheckCircle2 />,
      text: (
        <>
          <strong>Sources are refreshing.</strong> {nLive} of {liveSources.length} feeds updated within their
          normal window. Live refresh is handled by Claude scheduled tasks while a session is running.
        </>
      ),
    };
  } else if (allStale) {
    banner = {
      cls: "callout bad",
      ico: <Moon />,
      text: (
        <>
          <strong>Nothing has refreshed recently.</strong> Every live feed below is past its refresh window —
          this is normal overnight: the refresh workers (Claude scheduled tasks) only run while a Claude
          session is awake. Numbers shown are the last values pulled, with their real timestamps. They’ll go
          green again once the refresh tasks run. See <code>KNOWN-GAPS.md</code> → “Refresh depends on a live
          session.”
        </>
      ),
    };
  } else {
    banner = {
      cls: "callout warn",
      ico: <AlertTriangle />,
      text: (
        <>
          <strong>Partial freshness.</strong> {nLive} live, {nProblem} stale/stopped. Each row shows when it
          last actually updated — trust the timestamps, not the headline numbers, when a row is amber or red.
        </>
      ),
    };
  }

  return (
    <>
      <PageHead
        title="Data Health"
        sub="Where every number comes from, and how fresh it really is — no source is faked."
        right={
          <span className="pill">
            <span className="dot live" /> checked {fmt(now)}
          </span>
        }
      />

      <div className="card section-gap" style={{ marginBottom: 18 }}>
        <div className={banner.cls}>
          <span className="ico">{banner.ico}</span>
          {banner.text}
        </div>
      </div>

      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Radio /></span>Data sources</div>
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Status</th>
              <th>Last updated</th>
              <th>Freshness marker</th>
              <th>Refresh</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = STATUS[r.status];
              return (
                <tr key={r.key}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.label}</div>
                    <div className="src-up">{r.upstream}</div>
                    <div className="src-detail">{r.detail}</div>
                  </td>
                  <td>
                    <span className={s.badge}>
                      <span className={s.dot} /> {s.label}
                    </span>
                  </td>
                  <td>
                    <div>{fmt(r.lastWritten)}</div>
                    <div className="src-detail">{r.ageLabel}</div>
                  </td>
                  <td className="src-detail">{r.asOf || "—"}</td>
                  <td className="src-detail">{r.refresh}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="stat-sub" style={{ marginTop: 12 }}>
          “Last updated” is the real file-write time on this Mac. “Freshness marker” is the date the data itself
          carries (a deal date, an <code>asOf</code>, a sheet timestamp). When both agree and are recent, the
          source is genuinely current.
        </div>
      </div>

      <div className="card pad-lg section-gap">
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Plug /></span>Send &amp; integration bridges</div>
        <table>
          <thead>
            <tr>
              <th>Integration</th>
              <th>State</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {conns.map((c) => (
              <tr key={c.key}>
                <td style={{ fontWeight: 600 }}>{c.label}</td>
                <td>
                  <span className={"badge " + (c.ok ? "green" : "grey")}>
                    <span className={"dot " + (c.ok ? "live" : "off")} /> {c.ok ? "Ready" : "Not set"}
                  </span>
                </td>
                <td className="src-detail">{c.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="stat-sub" style={{ marginTop: 12 }}>
          Bridges are checked, never exercised — this page does not send any test text or email. The send paths
          were last verified working on 2026-06-24.
        </div>
      </div>

      <div className="card section-gap">
        <div className="callout">
          <span className="ico"><Lightbulb /></span>
          <strong>How “live” works here:</strong> the dealership DB and the Drive log are reachable only by
          Claude (via MCP), not by this web app directly. Claude’s scheduled tasks pull them on a timer and
          write the JSON this app reads. So “live” means “a refresh task ran recently” — this page is how you
          confirm that actually happened, rather than trusting a static <em>Live</em> label.
        </div>
      </div>
    </>
  );
}
