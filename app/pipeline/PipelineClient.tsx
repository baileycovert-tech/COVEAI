"use client";
import { useState } from "react";
import { Phone, X, RotateCcw } from "lucide-react";

type Lead = { name: string; vehicle?: string; note?: string; phone?: string };
type Col = { key: string; title: string; leads: Lead[] };
type Removed = { name: string; reason?: string; at?: string };

const COLORS: Record<string, string> = {
  hot: "var(--red)", working: "var(--accent-2)", warm: "var(--amber)",
  appointment: "var(--green)", closed: "var(--text-faint)",
};

export default function PipelineClient({ columns, removed: initialRemoved }: { columns: Col[]; removed: Removed[] }) {
  const [cols, setCols] = useState<Col[]>(columns);
  const [removed, setRemoved] = useState<Removed[]>(initialRemoved);
  const [busy, setBusy] = useState<string>("");
  const [showRemoved, setShowRemoved] = useState(false);

  async function dismiss(name: string) {
    setBusy(name);
    // optimistic: pull the lead out of every column
    setCols((cs) => cs.map((c) => ({ ...c, leads: c.leads.filter((l) => l.name !== name) })));
    try {
      const r = await fetch("/api/leads/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, on: true }) });
      if (r.ok) setRemoved((rm) => [{ name, reason: "clicked out" }, ...rm.filter((x) => x.name !== name)]);
    } finally { setBusy(""); }
  }

  async function restore(name: string) {
    setBusy(name);
    try {
      const r = await fetch("/api/leads/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, on: false }) });
      if (r.ok) { setRemoved((rm) => rm.filter((x) => x.name !== name)); window.location.reload(); }
    } finally { setBusy(""); }
  }

  return (
    <>
      <div className="kanban">
        {cols.map((col) => (
          <div className="col" key={col.key}>
            <div className="col-head">
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="dot" style={{ background: COLORS[col.key] || "var(--accent)", boxShadow: `0 0 7px ${COLORS[col.key] || "var(--accent)"}` }} />
                {col.title}
              </span>
              <span className="col-count">{col.leads.length}</span>
            </div>
            {col.leads.map((l, i) => (
              <div className="lead" key={l.name + i} style={{ position: "relative" }}>
                <button
                  onClick={() => dismiss(l.name)}
                  disabled={busy === l.name}
                  title="Click out — remove this lead"
                  style={{ position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 6, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))", color: "hsl(var(--faint))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}
                >
                  <X size={13} />
                </button>
                <div className="lead-name" style={{ paddingRight: 22 }}>{l.name}</div>
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

      {/* Click-out / removed leads */}
      <div className="card pad-lg section-gap">
        <button className="card-head" onClick={() => setShowRemoved((s) => !s)} style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <div className="card-title"><span className="ico"><RotateCcw /></span>Removed leads <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {removed.length} clicked out</span></div>
          <span className="muted" style={{ fontSize: 12 }}>{showRemoved ? "Hide" : "Show"}</span>
        </button>
        {showRemoved && (
          removed.length === 0 ? (
            <div className="empty" style={{ fontSize: 12, marginTop: 10 }}>Nothing removed. Click the ✕ on any lead to clear it off the board.</div>
          ) : (
            <div style={{ marginTop: 10 }}>
              {removed.map((r) => (
                <div className="row-item" key={r.name}>
                  <div className="row-main">
                    <div className="row-title">{r.name} {r.reason === "sold" && <span className="badge green" style={{ marginLeft: 6 }}>sold</span>}</div>
                    <div className="row-sub">{r.reason === "sold" ? "auto-cleared — matched a booked deal" : "clicked out"}</div>
                  </div>
                  <button className="btn sm ghost" onClick={() => restore(r.name)} disabled={busy === r.name} title={r.reason === "sold" ? "Not actually sold? Restore to the board" : "Put this lead back"}>
                    <RotateCcw size={13} /> Restore
                  </button>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </>
  );
}
