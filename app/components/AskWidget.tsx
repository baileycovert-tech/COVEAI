"use client";
import { useState, useRef, useEffect } from "react";
import { MessageSquare, X, Send, Sparkles, KeyRound, Check } from "lucide-react";

type Msg = { role: "you" | "bot"; text: string; source?: string };

const SUGGESTIONS = [
  "Who should I follow up with today?",
  "How am I doing this month?",
  "Show me used Lexus SUVs",
  "Draft a text to Dalton Miller",
];

export default function AskWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [keyErr, setKeyErr] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { scroller.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (open && hasKey === null) {
      fetch("/api/settings/key").then((r) => r.json()).then((d) => setHasKey(!!d.hasKey)).catch(() => setHasKey(false));
    }
  }, [open, hasKey]);

  async function saveKey() {
    const k = keyInput.trim();
    if (!k || savingKey) return;
    setSavingKey(true); setKeyErr("");
    try {
      const r = await fetch("/api/settings/key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: k }) });
      const d = await r.json();
      if (d.ok) { setHasKey(true); setKeyInput(""); setMsgs((m) => [...m, { role: "bot", text: "COVE is fully online. Ask me anything — I'll query the live database, work your pipeline, and draft in your voice.", source: "ai" }]); }
      else setKeyErr(d.error || "Could not save the key.");
    } catch { setKeyErr("Could not save the key."); }
    finally { setSavingKey(false); }
  }

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const priorHistory = msgs.map((m) => ({ role: m.role, text: m.text }));
    setMsgs((m) => [...m, { role: "you", text }]);
    setQ("");
    setBusy(true);
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history: priorHistory }) });
      if (!r.ok) {
        const text = r.status === 401 ? "Your session expired — sign in again to use COVE." : `COVE hit a server error (${r.status}). Try again in a moment.`;
        setMsgs((m) => [...m, { role: "bot", text }]);
        return;
      }
      const d = await r.json();
      setMsgs((m) => [...m, { role: "bot", text: d.answer || "No answer.", source: d.source }]);
    } catch {
      setMsgs((m) => [...m, { role: "bot", text: "Couldn't reach COVE — check your connection and try again." }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="ask-fab" onClick={() => setOpen(true)} aria-label="Ask COVE">
        <Sparkles size={18} /> COVE
      </button>
    );
  }

  return (
    <div className="ask-panel">
      <div className="ask-head">
        <div className="flex" style={{ gap: 8 }}>
          <span style={{ display: "inline-flex", color: "hsl(var(--primary))" }}><Sparkles size={16} /></span>
          <div style={{ lineHeight: 1.1 }}>
            <strong style={{ fontSize: 14 }}>COVE</strong>
            <div className="ask-src" style={{ marginTop: 0 }}>your AI sales assistant</div>
          </div>
          {hasKey && <span className="badge green" style={{ fontSize: 10 }}><Check size={11} /> Full</span>}
        </div>
        <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>
      </div>

      <div className="ask-body" ref={scroller}>
        {/* Key entry — shown only until a key is active. Entered here, never in chat. */}
        {hasKey === false && (
          <div className="ask-keybox">
            <div className="flex" style={{ gap: 7, fontWeight: 600, fontSize: 13 }}><KeyRound size={15} /> Unlock the full assistant</div>
            <div className="ask-hint" style={{ marginTop: 6 }}>
              Paste your Anthropic API key (starts with <code>sk-ant-</code>) to turn on full back-and-forth — live DB questions, follow-ups, and drafting, like Cowork. It's saved only on this Mac, never shared. Get one at console.anthropic.com → API Keys.
            </div>
            <div className="flex" style={{ gap: 6, marginTop: 8 }}>
              <input className="field" type="password" placeholder="sk-ant-…" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveKey()} />
              <button className="btn primary" onClick={saveKey} disabled={savingKey || !keyInput.trim()} style={{ padding: "0 14px" }}>{savingKey ? "…" : "Unlock"}</button>
            </div>
            {keyErr && <div className="ask-src" style={{ color: "hsl(var(--danger))", marginTop: 6 }}>{keyErr}</div>}
          </div>
        )}

        {msgs.length === 0 && (
          <div>
            <div className="ask-hint">I'm <strong>COVE</strong> — ask about your pipeline, a deal, a stock #/VIN, inventory, or “draft a text to …”. Answers come straight from your live data.</div>
            <div className="flex wrap" style={{ gap: 6, marginTop: 10 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="pill" style={{ cursor: "pointer", fontSize: 11 }} onClick={() => ask(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"ask-msg " + m.role}>
            {m.text.split("\n").map((line, j) => <div key={j}>{line || " "}</div>)}
            {m.role === "bot" && m.source === "lookup" && <div className="ask-src">direct from CRM data</div>}
            {m.role === "bot" && m.source === "ai" && <div className="ask-src">AI over your live CRM + DMS</div>}
          </div>
        ))}
        {busy && <div className="ask-msg bot"><span className="muted">working…</span></div>}
      </div>

      <form className="ask-input" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <input className="field" placeholder="Ask anything about deals, stock, VINs…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn primary" type="submit" disabled={busy || !q.trim()} style={{ padding: "0 12px" }}><Send size={15} /></button>
      </form>
    </div>
  );
}
