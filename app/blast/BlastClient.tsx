"use client";
import { useMemo, useState } from "react";
import { Mail, MessageSquare, Send, Check, Flame, AlertTriangle } from "lucide-react";

type Cust = { slug: string; name: string; vehicle: string; stage: string; hasEmail: boolean; hasPhone: boolean; hot: boolean };
type Sending = { gmailUser: string; hasPassword: boolean };

export default function BlastClient({ customers, sending }: { customers: Cust[]; sending: Sending }) {
  const [channel, setChannel] = useState<"email" | "text">("email");
  const [filter, setFilter] = useState<"all" | "hot" | "reachable">("reachable");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [template, setTemplate] = useState("Hi {first}, it's me at Covert Hutto — circling back on {vehicle}. Want me to line up a time this week? Just reply here.");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean; error?: string }[] | null>(null);

  const reachable = (c: Cust) => (channel === "email" ? c.hasEmail : c.hasPhone);
  const list = useMemo(() => customers.filter((c) => (filter === "hot" ? c.hot : filter === "reachable" ? reachable(c) : true)), [customers, filter, channel]);
  const selectedReachable = useMemo(() => customers.filter((c) => sel.has(c.slug) && reachable(c)), [customers, sel, channel]);

  const toggle = (slug: string) => setSel((s) => { const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n; });
  const allShown = list.length > 0 && list.every((c) => sel.has(c.slug));
  const toggleAll = () => setSel((s) => { const n = new Set(s); if (allShown) list.forEach((c) => n.delete(c.slug)); else list.forEach((c) => n.add(c.slug)); return n; });

  const sample = selectedReachable[0] || list[0];
  const preview = (t: string) => (t || "").replace(/\{first\}/gi, (sample?.name || "Friend").split(/\s+/)[0]).replace(/\{name\}/gi, sample?.name || "").replace(/\{vehicle\}/gi, sample?.vehicle || "your vehicle");

  async function doSend() {
    setBusy(true); setResults(null);
    try {
      const r = await fetch("/api/blast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, slugs: selectedReachable.map((c) => c.slug), subject, template }) });
      const d = await r.json();
      if (d.ok) setResults(d.results); else setResults([{ name: "Error", ok: false, error: d.error }]);
    } catch { setResults([{ name: "Error", ok: false, error: "Couldn't reach the server" }]); }
    finally { setBusy(false); setConfirm(false); }
  }

  if (results) {
    const sent = results.filter((r) => r.ok).length;
    return (
      <div className="card pad-lg" style={{ maxWidth: 640 }}>
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Check /></span>Blast sent</div>
        <div className="stat-value" style={{ fontSize: 26 }}>{sent} <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>of {results.length} delivered</span></div>
        <div style={{ marginTop: 12 }}>
          {results.filter((r) => !r.ok).map((r, i) => (
            <div className="row-item" key={i}><div className="row-main"><div className="row-title">{r.name}</div><div className="row-sub" style={{ color: "var(--red)" }}>{r.error}</div></div></div>
          ))}
        </div>
        <button className="btn mt" onClick={() => { setResults(null); setSel(new Set()); }}>New blast</button>
      </div>
    );
  }

  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      {/* Compose */}
      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 12 }}>Compose</div>
        <div className="flex gap-sm" style={{ marginBottom: 14 }}>
          <button className={"btn sm" + (channel === "email" ? " primary" : "")} onClick={() => setChannel("email")}><Mail size={14} /> Email</button>
          <button className={"btn sm" + (channel === "text" ? " primary" : "")} onClick={() => setChannel("text")}><MessageSquare size={14} /> Text</button>
        </div>

        {channel === "email" && !sending.hasPassword && (
          <div className="callout warn" style={{ marginBottom: 12, fontSize: 12.5 }}><span className="ico"><AlertTriangle /></span>
            <div>Link your Gmail in <a className="card-link" href="/setup">Setup</a> so blasts send from <strong>you</strong>. Until then they go from the shop mailer.</div>
          </div>
        )}
        {channel === "text" && (
          <div className="callout warn" style={{ marginBottom: 12, fontSize: 12.5 }}><span className="ico"><MessageSquare /></span>
            <div>Texts send from this shop Mac's number. For your own number, copy the draft and send from your phone.</div>
          </div>
        )}

        {channel === "email" && (<><label className="stat-label">Subject</label>
          <input className="field mt-sm" placeholder="Quick question about {vehicle}" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginBottom: 12 }} /></>)}
        <label className="stat-label">Message</label>
        <textarea className="field mt-sm" rows={6} value={template} onChange={(e) => setTemplate(e.target.value)} />
        <div className="stat-sub" style={{ marginTop: 6 }}>Tokens fill per customer: <code>{"{first}"}</code> <code>{"{name}"}</code> <code>{"{vehicle}"}</code></div>

        {sample && (
          <div className="card" style={{ marginTop: 12, padding: "10px 12px", background: "hsl(var(--muted))", fontSize: 13 }}>
            <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Preview → {sample.name}</div>
            {channel === "email" && subject && <div style={{ fontWeight: 600 }}>{preview(subject)}</div>}
            <div style={{ whiteSpace: "pre-wrap" }}>{preview(template)}</div>
          </div>
        )}
      </div>

      {/* Recipients */}
      <div className="card pad-lg">
        <div className="card-head">
          <div className="card-title">Recipients <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {selectedReachable.length} selected</span></div>
          <button className="btn ghost sm" onClick={toggleAll}>{allShown ? "Clear" : "Select all"}</button>
        </div>
        <div className="flex gap-sm wrap" style={{ margin: "8px 0 12px" }}>
          {(["reachable", "hot", "all"] as const).map((f) => (
            <button key={f} className={"pill" + (filter === f ? " chip-on" : "")} style={{ cursor: "pointer", border: filter === f ? "1px solid hsl(var(--primary))" : undefined, color: filter === f ? "hsl(var(--primary))" : undefined }} onClick={() => setFilter(f)}>
              {f === "reachable" ? (channel === "email" ? "Has email" : "Has phone") : f === "hot" ? "Hot only" : "All"}
            </button>
          ))}
        </div>
        <div style={{ maxHeight: 360, overflowY: "auto" }}>
          {list.map((c) => (
            <label key={c.slug} className="row-item" style={{ cursor: reachable(c) ? "pointer" : "not-allowed", opacity: reachable(c) ? 1 : 0.45 }}>
              <input type="checkbox" checked={sel.has(c.slug)} disabled={!reachable(c)} onChange={() => toggle(c.slug)} style={{ width: 17, height: 17 }} />
              <div className="row-main">
                <div className="row-title">{c.name} {c.hot && <Flame size={12} style={{ color: "var(--red)" }} />}</div>
                <div className="row-sub">{c.vehicle || "—"}{!reachable(c) ? ` · no ${channel === "email" ? "email" : "phone"}` : ""}</div>
              </div>
            </label>
          ))}
          {list.length === 0 && <div className="empty" style={{ fontSize: 13 }}>No customers match.</div>}
        </div>
      </div>

      {/* Send bar */}
      <div className="card pad-lg" style={{ gridColumn: "1 / -1" }}>
        {!confirm ? (
          <button className="btn primary" disabled={selectedReachable.length === 0 || !template.trim()} onClick={() => setConfirm(true)}>
            <Send size={15} /> Review &amp; send to {selectedReachable.length} customer{selectedReachable.length === 1 ? "" : "s"}
          </button>
        ) : (
          <div className="callout warn">
            <span className="ico"><AlertTriangle /></span>
            <div style={{ flex: 1 }}>
              <strong>Send this {channel} to {selectedReachable.length} customer{selectedReachable.length === 1 ? "" : "s"} now?</strong>
              <div className="stat-sub" style={{ marginTop: 2 }}>This sends real messages. {channel === "email" && (sending.hasPassword ? `From ${sending.gmailUser}.` : "From the shop mailer.")}</div>
              <div className="flex gap-sm mt-sm">
                <button className="btn primary" onClick={doSend} disabled={busy}>{busy ? "Sending…" : `Yes, send ${selectedReachable.length}`}</button>
                <button className="btn ghost" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
