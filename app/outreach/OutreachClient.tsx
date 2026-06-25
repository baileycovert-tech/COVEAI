"use client";
import { useState } from "react";

type Cust = { slug: string; name: string; vehicle: string; next: string; hot: boolean; hasPhone: boolean; hasEmail: boolean };
type Draft = {
  id: string; customer: string; slug: string; channel: "text" | "email";
  subject?: string; body: string; status: string; createdAt: string;
  rationale?: string; generatedBy: "ai" | "template";
};

export default function OutreachClient({
  customers, initialQueue, aiEnabled, preselect,
}: {
  customers: Cust[]; initialQueue: Draft[]; aiEnabled: boolean; preselect: string;
}) {
  const [queue, setQueue] = useState<Draft[]>(initialQueue);
  const [slug, setSlug] = useState(preselect || customers[0]?.slug || "");
  const [channel, setChannel] = useState<"text" | "email">("text");
  const [intent, setIntent] = useState("");
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [sendingId, setSendingId] = useState("");
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  const selected = customers.find((c) => c.slug === slug);
  const custBySlug = (s: string) => customers.find((c) => c.slug === s);

  // Block generating a channel the customer has no contact info for.
  const canText = selected?.hasPhone;
  const canEmail = selected?.hasEmail;

  async function generate() {
    if (!slug) return;
    setBusy(true);
    try {
      const r = await fetch("/api/outreach/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, channel, intent }),
      });
      const data = await r.json();
      if (data.draft) setQueue((q) => [data.draft, ...q]);
      setIntent("");
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, fields: Partial<Draft>) {
    const r = await fetch("/api/outreach/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...fields }),
    });
    const data = await r.json();
    if (data.draft) setQueue((q) => q.map((d) => (d.id === id ? data.draft : d)));
  }

  async function sendNow(id: string) {
    setSendingId(id);
    setErrorById((e) => ({ ...e, [id]: "" }));
    try {
      const r = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await r.json();
      if (data.ok) {
        setQueue((qq) => qq.map((d) => (d.id === id ? { ...d, status: "sent", sentTo: data.to } : d)));
      } else {
        setErrorById((e) => ({ ...e, [id]: data.error || "Send failed" }));
      }
    } catch (err: any) {
      setErrorById((e) => ({ ...e, [id]: String(err?.message || err) }));
    } finally {
      setSendingId("");
    }
  }

  async function remove(id: string) {
    await fetch("/api/outreach/queue", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setQueue((q) => q.filter((d) => d.id !== id));
  }

  function copy(d: Draft) {
    const text = (d.subject ? `Subject: ${d.subject}\n\n` : "") + d.body;
    navigator.clipboard?.writeText(text);
    setCopiedId(d.id);
    setTimeout(() => setCopiedId(""), 1500);
  }

  const pending = queue.filter((d) => d.status === "draft");
  const approved = queue.filter((d) => d.status === "approved");
  const sent = queue.filter((d) => d.status === "sent");

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">AI Outreach</h1>
          <div className="page-sub">Draft customer messages in Bailey's voice · review · approve · send. Nothing leaves without your click.</div>
        </div>
        <span className="pill">
          <span className="dot" style={{ background: aiEnabled ? "var(--green)" : "var(--amber)" }} />
          {aiEnabled ? "Claude AI drafting on" : "Template mode (add API key for AI)"}
        </span>
      </div>

      <div className="grid cols-2">
        {/* Composer */}
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 14 }}>New draft</div>

          <label className="stat-label">Customer</label>
          <select className="field mt-sm" value={slug} onChange={(e) => setSlug(e.target.value)}>
            {customers.map((c) => (
              <option key={c.slug} value={c.slug}>{c.hot ? "" : ""}{c.name}{c.vehicle ? ` — ${c.vehicle}` : ""}</option>
            ))}
          </select>

          {selected?.next && (
            <div className="callout mt" style={{ fontSize: 12.5 }}>
              <strong>On file:</strong> {selected.next}
            </div>
          )}

          <label className="stat-label mt">Channel</label>
          <div className="flex gap-sm mt-sm">
            <button className={"btn sm" + (channel === "text" ? " primary" : "")} onClick={() => setChannel("text")}>
              Text {!canText && <span style={{ opacity: 0.6 }}>(no #)</span>}
            </button>
            <button className={"btn sm" + (channel === "email" ? " primary" : "")} onClick={() => setChannel("email")}>
              Email {!canEmail && <span style={{ opacity: 0.6 }}>(no email)</span>}
            </button>
          </div>
          {((channel === "text" && !canText) || (channel === "email" && !canEmail)) && (
            <div className="stat-sub" style={{ color: "var(--amber)", marginTop: 8 }}>
              No {channel === "text" ? "phone number" : "email"} on file for {selected?.name}. You can still draft, but it can't be sent until you add one to the customer record.
            </div>
          )}

          <label className="stat-label mt">Goal of this message <span className="muted">(optional)</span></label>
          <textarea
            className="field mt-sm" rows={3}
            placeholder="e.g. Confirm Saturday 11am test drive and ask if his wife is coming"
            value={intent} onChange={(e) => setIntent(e.target.value)}
          />

          <button className="btn primary mt" style={{ width: "100%", justifyContent: "center" }} onClick={generate} disabled={busy || !slug}>
            {busy ? "Drafting…" : aiEnabled ? "Generate with Claude" : "Generate draft"}
          </button>
        </div>

        {/* Counts */}
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 14 }}>Queue</div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ fontSize: 26 }}>{pending.length}</div>
              <div className="stat-label" style={{ justifyContent: "center" }}>To review</div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ fontSize: 26, color: "var(--green)" }}>{approved.length}</div>
              <div className="stat-label" style={{ justifyContent: "center" }}>Approved</div>
            </div>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="stat-value" style={{ fontSize: 26, color: "var(--text-faint)" }}>{sent.length}</div>
              <div className="stat-label" style={{ justifyContent: "center" }}>Sent</div>
            </div>
          </div>
          <div className="stat-sub mt">
            Approve a draft, then hit <strong>Send now</strong> — texts go out as a real iMessage and emails send from your Gmail, straight to the customer. Nothing sends until you approve and click.
          </div>
        </div>
      </div>

      {/* Drafts to review */}
      <div className="nav-label" style={{ margin: "24px 0 10px" }}>To review ({pending.length})</div>
      {pending.length === 0 && <div className="card"><div className="empty">No drafts waiting. Generate one above.</div></div>}
      <div className="grid cols-2">
        {pending.map((d) => (
          <DraftCard key={d.id} d={d} onApprove={() => patch(d.id, { status: "approved" })}
            onSave={(body, subject) => patch(d.id, { body, subject })}
            onDismiss={() => remove(d.id)} onCopy={() => copy(d)} copied={copiedId === d.id} />
        ))}
      </div>

      {approved.length > 0 && (
        <>
          <div className="nav-label" style={{ margin: "24px 0 10px" }}>Approved — ready to send ({approved.length})</div>
          <div className="grid cols-2">
            {approved.map((d) => {
              const c = custBySlug(d.slug);
              const canSend = d.channel === "email" ? c?.hasEmail : c?.hasPhone;
              return (
                <DraftCard key={d.id} d={d} approvedView
                  canSend={!!canSend} sending={sendingId === d.id} error={errorById[d.id]}
                  onSend={() => sendNow(d.id)}
                  onDismiss={() => remove(d.id)} onCopy={() => copy(d)} copied={copiedId === d.id} />
              );
            })}
          </div>
        </>
      )}

      {sent.length > 0 && (
        <>
          <div className="nav-label" style={{ margin: "24px 0 10px" }}>Sent ({sent.length})</div>
          <div className="grid cols-2">
            {sent.map((d) => (
              <div className="card" key={d.id} style={{ opacity: 0.7 }}>
                <div className="flex between">
                  <strong>{d.customer}</strong>
                  <span className="badge green">Sent</span>
                </div>
                <div className="draft-body mt-sm" style={{ fontSize: 12.5 }}>{d.subject ? `Subject: ${d.subject}\n\n` : ""}{d.body}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function DraftCard({
  d, onApprove, onSave, onDismiss, onCopy, onSend, copied, approvedView,
  canSend, sending, error,
}: {
  d: Draft; onApprove?: () => void; onSave?: (body: string, subject?: string) => void;
  onDismiss: () => void; onCopy: () => void; onSend?: () => void; copied: boolean; approvedView?: boolean;
  canSend?: boolean; sending?: boolean; error?: string;
}) {
  const [edit, setEdit] = useState(false);
  const [body, setBody] = useState(d.body);
  const [subject, setSubject] = useState(d.subject || "");

  return (
    <div className="card pad-lg">
      <div className="flex between">
        <div className="flex gap-sm">
          <strong>{d.customer}</strong>
          <span className="badge">{d.channel === "email" ? "Email" : "Text"}</span>
          <span className={"badge " + (d.generatedBy === "ai" ? "new" : "amber")}>{d.generatedBy === "ai" ? "Claude" : "Template"}</span>
        </div>
        {approvedView && <span className="badge green">Approved</span>}
      </div>
      {d.rationale && <div className="stat-sub" style={{ marginTop: 8 }}>{d.rationale}</div>}

      {edit ? (
        <div className="mt-sm">
          {d.channel === "email" && (
            <input className="field" style={{ marginBottom: 8 }} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          )}
          <textarea className="field" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex gap-sm mt-sm">
            <button className="btn primary sm" onClick={() => { onSave?.(body, subject); setEdit(false); }}>Save</button>
            <button className="btn sm ghost" onClick={() => { setBody(d.body); setSubject(d.subject || ""); setEdit(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="draft-body mt-sm">{d.subject ? `Subject: ${d.subject}\n\n` : ""}{d.body}</div>
      )}

      <div className="flex gap-sm wrap mt">
        <button className="btn sm" onClick={onCopy}>{copied ? "✓ Copied" : "Copy"}</button>
        {!edit && <button className="btn sm ghost" onClick={() => setEdit(true)}>Edit</button>}
        {onApprove && !edit && <button className="btn green sm" onClick={onApprove}>✓ Approve</button>}
        {onSend && (
          <button className="btn green sm" onClick={onSend} disabled={sending || !canSend}
            title={!canSend ? "No contact info on file for this channel" : `Send the ${d.channel} now`}>
            {sending ? "Sending…" : d.channel === "email" ? "Send email now" : "Send text now"}
          </button>
        )}
        <button className="btn sm ghost" style={{ marginLeft: "auto", color: "var(--red)" }} onClick={onDismiss}>Dismiss</button>
      </div>
      {error && <div className="stat-sub" style={{ color: "var(--red)", marginTop: 10 }}>{error}</div>}
      {approvedView && !canSend && !error && (
        <div className="stat-sub" style={{ color: "var(--amber)", marginTop: 10 }}>
          No {d.channel === "email" ? "email" : "phone number"} on file — add one to the customer record to enable sending.
        </div>
      )}
    </div>
  );
}
