"use client";
import { useState } from "react";
import { Phone, Mail, Plus, X, IdCard, Save } from "lucide-react";

type Profile = { phones: string[]; emails: string[] };

export default function SetupForm({ name, s1Ford, s1Chevy, initial }: { name: string; s1Ford: string | null; s1Chevy: string | null; initial: Profile }) {
  const [phones, setPhones] = useState<string[]>(initial.phones.length ? initial.phones : [""]);
  const [emails, setEmails] = useState<string[]>(initial.emails.length ? initial.emails : [""]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const upd = (set: any, arr: string[], i: number, v: string) => set(arr.map((x, j) => (j === i ? v : x)));
  const add = (set: any, arr: string[]) => set([...arr, ""]);
  const rm = (set: any, arr: string[], i: number) => set(arr.filter((_, j) => j !== i).length ? arr.filter((_, j) => j !== i) : [""]);

  async function save() {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phones: phones.filter((x) => x.trim()), emails: emails.filter((x) => x.trim()) }),
      });
      const d = await r.json();
      if (d.ok) {
        setMsg("Saved — COVE will attribute these to you.");
        setPhones(d.profile.phones.length ? d.profile.phones : [""]);
        setEmails(d.profile.emails.length ? d.profile.emails : [""]);
      } else setErr(d.error || "Couldn't save.");
    } catch { setErr("Couldn't reach the server."); }
    finally { setBusy(false); }
  }

  return (
    <div className="card pad-lg" style={{ maxWidth: 620 }}>
      {/* Identity */}
      <div className="callout" style={{ marginBottom: 18 }}>
        <span className="ico"><IdCard /></span>
        <div>
          <strong>{name}</strong>
          <div className="stat-sub" style={{ marginTop: 2 }}>
            Employee #: {s1Ford ? `Ford ${s1Ford}` : ""}{s1Ford && s1Chevy ? " · " : ""}{s1Chevy ? `Chevy ${s1Chevy}` : ""}
            {!s1Ford && !s1Chevy ? "—" : ""} <span className="muted">(from your login — your DMS leads pull from these)</span>
          </div>
        </div>
      </div>

      {/* Phones */}
      <label className="stat-label"><Phone size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />Your work phone number(s)</label>
      <div className="stat-sub" style={{ marginBottom: 8 }}>The number(s) your customers text you on — so a text lead lands on YOUR board, not someone else's.</div>
      {phones.map((p, i) => (
        <div key={i} className="flex" style={{ gap: 8, marginBottom: 8 }}>
          <input className="field" inputMode="tel" placeholder="(512) 555-0134" value={p} onChange={(e) => upd(setPhones, phones, i, e.target.value)} />
          <button className="btn ghost sm" onClick={() => rm(setPhones, phones, i)} aria-label="Remove"><X size={15} /></button>
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => add(setPhones, phones)} style={{ marginBottom: 18 }}><Plus size={14} /> Add another number</button>

      {/* Emails */}
      <label className="stat-label"><Mail size={13} style={{ marginRight: 6, verticalAlign: "-2px" }} />Your work email(s)</label>
      <div className="stat-sub" style={{ marginBottom: 8 }}>Where your lead notifications and customer emails arrive (e.g. your @covertauto.com or the Gmail your CRM forwards to).</div>
      {emails.map((e, i) => (
        <div key={i} className="flex" style={{ gap: 8, marginBottom: 8 }}>
          <input className="field" inputMode="email" placeholder="you@covertauto.com" value={e} onChange={(ev) => upd(setEmails, emails, i, ev.target.value)} />
          <button className="btn ghost sm" onClick={() => rm(setEmails, emails, i)} aria-label="Remove"><X size={15} /></button>
        </div>
      ))}
      <button className="btn ghost sm" onClick={() => add(setEmails, emails)} style={{ marginBottom: 20 }}><Plus size={14} /> Add another email</button>

      <div className="flex" style={{ gap: 12, alignItems: "center" }}>
        <button className="btn primary" onClick={save} disabled={busy}><Save size={15} /> {busy ? "Saving…" : "Save my setup"}</button>
        {msg && <span style={{ color: "var(--green)", fontSize: 13 }}>{msg}</span>}
        {err && <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>}
      </div>
    </div>
  );
}
