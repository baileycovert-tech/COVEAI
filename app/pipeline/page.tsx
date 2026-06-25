import { redirect } from "next/navigation";
import { getPipeline } from "../lib/data";
import { currentUser } from "../lib/auth";
import { PageHead, LivePill } from "../components/ui";
import { Phone } from "lucide-react";

export const dynamic = "force-dynamic";

const COLORS: Record<string, string> = {
  hot: "var(--red)", working: "var(--accent-2)", warm: "var(--amber)",
  appointment: "var(--green)", closed: "var(--text-faint)",
};

export default function PipelinePage() {
  if (!currentUser()?.isAdmin) redirect("/");
  const p = getPipeline();
  const total = p.columns.reduce((n, c) => n + c.leads.length, 0);

  return (
    <>
      <PageHead
        title="Pipeline"
        sub={`${total} leads in motion · ${p.standing}`}
        right={<LivePill text={`Refreshed ${p.last_refresh}`} />}
      />
      <div className="kanban">
        {p.columns.map((col) => (
          <div className="col" key={col.key}>
            <div className="col-head">
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="dot" style={{ background: COLORS[col.key] || "var(--accent)", boxShadow: `0 0 7px ${COLORS[col.key] || "var(--accent)"}` }} />
                {col.title}
              </span>
              <span className="col-count">{col.leads.length}</span>
            </div>
            {col.leads.map((l, i) => (
              <div className="lead" key={i}>
                <div className="lead-name">{l.name}</div>
                {l.vehicle && <div className="lead-veh">{l.vehicle}</div>}
                {l.note && <div className="lead-note">{l.note}</div>}
                {l.phone && (
                  <div className="lead-meta"><span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Phone size={12} /> {l.phone}</span></div>
                )}
              </div>
            ))}
            {col.leads.length === 0 && <div className="empty" style={{ padding: 20, fontSize: 12 }}>Empty</div>}
          </div>
        ))}
      </div>
    </>
  );
}
