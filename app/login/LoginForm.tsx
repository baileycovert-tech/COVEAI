"use client";
import { useState } from "react";

export default function LoginForm({ roster, next }: { roster: { slug: string; name: string }[]; next: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = await r.json();
      if (data.ok) { window.location.href = next || "/"; }
      else { setErr(data.error || "Login failed"); setBusy(false); }
    } catch { setErr("Network error"); setBusy(false); }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ justifyContent: "center", marginBottom: 6 }}>
          <div className="brand-logo">C</div>
        </div>
        <h1 style={{ textAlign: "center", fontSize: 22, fontWeight: 760, margin: "6px 0 2px" }}>Covert CRM</h1>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 13, marginBottom: 22 }}>
          Sign in with your Covert employee number.
        </p>

        <label className="stat-label">Employee number</label>
        <input
          className="field mt-sm" type="text" inputMode="numeric" autoComplete="off"
          placeholder="e.g. 1249" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus
        />

        <label className="stat-label mt">Your name <span className="muted">(optional)</span></label>
        <input
          className="field mt-sm" list="roster" placeholder="Start typing your name…"
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <datalist id="roster">
          {roster.map((r) => <option key={r.slug} value={r.name} />)}
        </datalist>

        {err && <div className="stat-sub" style={{ color: "var(--red)", marginTop: 12 }}>⚠️ {err}</div>}

        <button className="btn primary mt" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 11.5, marginTop: 16 }}>
          Covert Auto Group — Hutto. Your employee number is your Ford or Chevy store number.
        </p>
      </form>
    </div>
  );
}
