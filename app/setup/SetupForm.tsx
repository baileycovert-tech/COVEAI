"use client";
import { useState } from "react";
import { Phone, Mail, Plus, X, IdCard, Save, Send, Check, MessageSquare } from "lucide-react";

type Profile = { phones: string[]; emails: string[] };
type Sending = { gmailUser: string; hasPassword: boolean };

export default function SetupForm({ name, s1Ford, s1Chevy, initial, sending }: { name: string; s1Ford: string | null; s1Chevy: string | null; initial: Profile; sending: Sending }) {
  const [phones, setPhones] = useState<string[]>(initial.phones.length ? initial.phones : [""]);
  const [emails, setEmails] = useState<string[]>(initial.emails.length ? initial.emails : [""]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  // Gmail sending link
  const [gmailUser, setGmailUser] = useState(sending.gmailUser || "");
  const [appPass, setAppPass] = useState("");
  const [linked, setLinked] = useState(sending.hasPassword);
  const [sBusy, setSBusy] = useState(false);
  const [sMsg, setSMsg] = useState("");
  const [sErr, setSErr] = useState("");

  async function linkGmail(disconnect = false) {
    setSBusy(true); setSMsg(""); setSErr("");
    try {
      const r = await fetch("/api/setup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(disconnect ? { action: "sending", gmailUser: "" } : { action: "sending", gmailUser: gmailUser.trim(), appPassword: appPass.trim() }),
      });
      const d = await r.json();
      if (!d.ok) { setSErr(d.error || "Couldn't save."); return; }
      setLinked(d.sending.hasPassword); setGmailUser(d.sending.gmailUser); setAppPass("");
      setSMsg(disconnect ? "Disconnected."
        : d.warn ? `Connected — COVE is reading your inbox. Note: ${d.warn}`
        : "Connected — COVE now reads your leads and sends email as you.");
    } catch { setSErr("Couldn't reach the server."); }
    finally { setSBusy(false); }
  }

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

      {/* ---- Connect your email (read leads + send as you) ---- */}
      <div style={{ borderTop: "1px solid hsl(var(--border-soft))", margin: "22px 0 18px" }} />
      <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><Mail /></span>Connect your email</div>
      <div className="stat-sub" style={{ marginBottom: 12 }}>
        Link your Gmail once and COVE will <strong>read your inbox for new leads</strong> and <strong>send blasts from your address</strong> (replies come straight to you).
        It uses a Google <em>App Password</em> — a one-off 16-character key, not your login password — stored only on this Mac. We verify it before saving.
      </div>
      {linked && !appPass ? (
        <div className="callout" style={{ marginBottom: 12 }}>
          <span className="ico"><Check /></span>
          <div>
            <strong>Connected:</strong> {gmailUser} <span className="badge green" style={{ marginLeft: 6 }}>reading + sending</span>
            <div className="flex gap-sm mt-sm">
              <button className="btn ghost sm" onClick={() => setAppPass(" ")}>Update password</button>
              <button className="btn ghost sm" style={{ color: "var(--red)" }} onClick={() => linkGmail(true)} disabled={sBusy}>Disconnect</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Guided steps — so a brand-new employee can do this without help */}
          <ol className="setup-steps" style={{ margin: "0 0 14px", paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
            <li className="flex" style={{ gap: 10, alignItems: "baseline" }}>
              <span className="step-num">1</span>
              <span style={{ fontSize: 13 }}>Turn on <a className="card-link" href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">2-Step Verification</a> for your Google account (required before you can make an App Password).</span>
            </li>
            <li className="flex" style={{ gap: 10, alignItems: "baseline" }}>
              <span className="step-num">2</span>
              <span style={{ fontSize: 13 }}>Open <a className="card-link" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google App Passwords</a>, type the name <strong>COVE</strong>, and click <strong>Create</strong>.</span>
            </li>
            <li className="flex" style={{ gap: 10, alignItems: "baseline" }}>
              <span className="step-num">3</span>
              <span style={{ fontSize: 13 }}>Copy the 16-character password Google shows you and paste it below with your email address.</span>
            </li>
          </ol>
          <input className="field" inputMode="email" placeholder="you@covertauto.com (or your Gmail)" value={gmailUser} onChange={(e) => setGmailUser(e.target.value)} style={{ marginBottom: 8 }} />
          <input className="field" type="password" placeholder="16-character App Password (e.g. abcd efgh ijkl mnop)" value={appPass.trim() ? appPass : ""} onChange={(e) => setAppPass(e.target.value)} style={{ marginBottom: 8 }} />
          <div className="flex gap-sm" style={{ alignItems: "center" }}>
            <button className="btn primary" onClick={() => linkGmail(false)} disabled={sBusy || !gmailUser.trim() || !appPass.trim()}><Send size={14} /> {sBusy ? "Verifying…" : "Connect email"}</button>
            {sMsg && <span style={{ color: "var(--green)", fontSize: 13 }}>{sMsg}</span>}
            {sErr && <span style={{ color: "var(--red)", fontSize: 13 }}>{sErr}</span>}
          </div>
        </>
      )}
      {linked && !appPass && sMsg && <div style={{ color: "var(--green)", fontSize: 13, marginTop: 6 }}>{sMsg}</div>}

      {/* Texts — honest note */}
      <div className="callout" style={{ marginTop: 16, fontSize: 12.5 }}>
        <span className="ico"><MessageSquare /></span>
        <div><strong>Texts:</strong> COVE drafts texts in your voice, but iMessages send from this shop Mac's number. To blast from <em>your</em> number, send the draft from your own phone (one tap to copy) — true per-rep texting needs COVE on your own Mac.</div>
      </div>
    </div>
  );
}
