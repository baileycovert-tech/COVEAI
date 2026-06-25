"use client";
import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles } from "lucide-react";

type Msg = { role: "you" | "bot"; text: string; source?: string };

const SUGGESTIONS = [
  "What color is stock 260897?",
  "Show me aged Broncos",
  "VIN for a white F-150",
  "Did we sell a Telluride this month?",
];

export default function AskWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs, busy]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    setMsgs((m) => [...m, { role: "you", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text }) });
      const d = await r.json();
      setMsgs((m) => [...m, { role: "bot", text: d.answer || "No answer.", source: d.source }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Something went wrong reaching the data." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="ask-fab" onClick={() => setOpen(true)} aria-label="Ask the CRM">
        <MessageSquare size={20} /> Ask
      </button>
    );
  }

  return (
    <div className="ask-panel">
      <div className="ask-head">
        <div className="flex" style={{ gap: 8 }}>
          <span style={{ display: "inline-flex", color: "hsl(var(--primary))" }}><Sparkles size={16} /></span>
          <strong style={{ fontSize: 14 }}>Ask the CRM</strong>
        </div>
        <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
      </div>

      <div className="ask-body" ref={scroller}>
        {msgs.length === 0 && (
          <div>
            <div className="ask-hint">Ask about a stock #, VIN, color, trim, a past deal, or a customer. Answers come straight from your live data.</div>
            <div className="flex wrap" style={{ gap: 6, marginTop: 10 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pill" style={{ cursor: "pointer", fontSize: 11 }} onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"ask-msg " + m.role}>
            {m.text.split("\n").map((line, j) => <div key={j}>{line || " "}</div>)}
            {m.role === "bot" && m.source === "lookup" && <div className="ask-src">direct from CRM data</div>}
            {m.role === "bot" && m.source === "ai" && <div className="ask-src">AI over your CRM data</div>}
          </div>
        ))}
        {busy && <div className="ask-msg bot"><span className="muted">searching…</span></div>}
      </div>

      <form className="ask-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="field" placeholder="Ask anything about deals, stock, VINs…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn primary" type="submit" disabled={busy || !q.trim()} style={{ padding: "0 12px" }}><Send size={15} /></button>
      </form>
    </div>
  );
}
