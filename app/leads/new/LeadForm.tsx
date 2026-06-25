"use client";
import { useState } from "react";

export default function LeadForm({ isAdmin, repFirst }: { isAdmin: boolean; repFirst: string }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", vehicle: "", source: "Walk-in", notes: "" });
  const [touch, setTouch] = useState<"none" | "text" | "email">("none");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await fetch("/api/leads", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, firstTouchChannel: touch }),
      });
      const data = await r.json();
      setResult(data);
      if (data.ok) setF({ name: "", phone: "", email: "", vehicle: "", source: "Walk-in", notes: "" });
    } catch { setResult({ error: "Network error" }); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head"><div><h1 className="page-title">Add a lead</h1>
        <div className="page-sub">Log a walk-in, phone-up, or referral — it lands on your board and auto-matches to stock.</div></div></div>

      <div className="grid cols-2">
        <form className="card pad-lg" onSubmit={submit}>
          <label className="stat-label">Customer name *</label>
          <input className="field mt-sm" value={f.name} onChange={set("name")} placeholder="First Last" required autoFocus />

          <div className="grid cols-2" style={{ gap: 12, marginTop: 14 }}>
            <div><label className="stat-label">Phone</label>
              <input className="field mt-sm" value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="512-555-1234" /></div>
            <div><label className="stat-label">Email</label>
              <input className="field mt-sm" value={f.email} onChange={set("email")} inputMode="email" placeholder="name@email.com" /></div>
          </div>

          <label className="stat-label mt">Vehicle of interest</label>
          <input className="field mt-sm" value={f.vehicle} onChange={set("vehicle")} placeholder="e.g. 2026 F-150 Lariat, or Tahoe" />

          <div className="grid cols-2" style={{ gap: 12, marginTop: 14 }}>
            <div><label className="stat-label">Source</label>
              <select className="field mt-sm" value={f.source} onChange={set("source")}>
                {["Walk-in", "Phone-up", "Referral", "Internet", "Repeat", "Other"].map((s) => <option key={s}>{s}</option>)}
              </select></div>
          </div>

          <label className="stat-label mt">Notes</label>
          <textarea className="field mt-sm" rows={2} value={f.notes} onChange={set("notes")} placeholder="Trade, timeline, budget, anything to remember…" />

          {isAdmin && (
            <div className="card mt" style={{ background: "rgba(59,130,246,.08)", borderColor: "rgba(59,130,246,.3)" }}>
              <label className="stat-label" style={{ marginBottom: 8 }}>Auto first-touch to the customer</label>
              <div className="flex gap-sm wrap">
                <button type="button" className={"btn sm" + (touch === "none" ? " primary" : "")} onClick={() => setTouch("none")}>Don't send</button>
                <button type="button" className={"btn sm" + (touch === "text" ? " primary" : "")} onClick={() => setTouch("text")}>Text now</button>
                <button type="button" className={"btn sm" + (touch === "email" ? " primary" : "")} onClick={() => setTouch("email")}>Email now</button>
              </div>
              {touch !== "none" && <div className="stat-sub mt-sm">Sends a friendly first-touch in your voice the instant you save — to the {touch === "email" ? "email" : "phone"} above.</div>}
            </div>
          )}

          <button className="btn primary mt" style={{ width: "100%", justifyContent: "center" }} disabled={busy || !f.name}>
            {busy ? "Saving…" : touch !== "none" ? "Save lead + send first-touch" : "Save lead"}
          </button>
        </form>

        <div>
          {result?.error && <div className="callout" style={{ borderColor: "rgba(248,113,113,.4)", background: "rgba(248,113,113,.08)" }}>{result.error}</div>}
          {result?.ok && (
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 10 }}>Lead saved</div>
              <div className="lead-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                It's on your board now. Inventory match: <strong>{result.match}</strong>.
                {result.firstTouch?.ok && <><br /><br />First-touch <strong>sent</strong> to the customer via {result.firstTouch.channel}.</>}
                {result.firstTouch && !result.firstTouch.ok && <><br /><br />First-touch not sent: {result.firstTouch.error}</>}
              </div>
              <a className="btn mt" href="/">Back to board</a>
            </div>
          )}
          {!result && (
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 10 }}>Tip</div>
              <div className="lead-note" style={{ fontSize: 13, lineHeight: 1.6 }}>
                Add the vehicle of interest and the system instantly tells you what's in stock that fits — and flags aged units with the most deal room. {isAdmin ? "Flip on auto first-touch to greet the customer the second you log them." : ""}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
