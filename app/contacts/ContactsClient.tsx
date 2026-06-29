"use client";
import { useState } from "react";
import { Search, UserPlus, Phone, Mail, X, Check, Pencil } from "lucide-react";

type Hit = { name: string; phone: string; email: string; source: string };
type Added = { name: string; phone: string | null; email: string | null; at: string };

export default function ContactsClient({ initial, indexReady }: { initial: Added[]; indexReady: boolean }) {
  const [added, setAdded] = useState<Added[]>(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);
  // add/correct form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function search() {
    if (q.trim().length < 2) return;
    setSearched(true);
    const r = await fetch("/api/contacts?q=" + encodeURIComponent(q));
    const d = await r.json();
    if (d.ok) setHits(d.indexMatches || []);
  }
  function prefill(n: string, p = "", e = "") {
    setName(n); setPhone(p); setEmail(e); setMsg(""); setErr("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save() {
    if (!name.trim()) { setErr("Enter a name."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }) });
      const d = await r.json();
      if (d.ok) { setAdded(d.added); setMsg(`Saved — COVE will use this for ${name.trim()}.`); setName(""); setPhone(""); setEmail(""); }
      else setErr(d.error || "Couldn't save.");
    } catch { setErr("Couldn't reach the server."); }
    finally { setBusy(false); }
  }
  async function remove(n: string) {
    const r = await fetch("/api/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: n, remove: true }) });
    const d = await r.json();
    if (d.ok) setAdded(d.added);
  }

  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      {/* Add / correct */}
      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><UserPlus /></span>Add or correct a contact</div>
        <div className="stat-sub" style={{ marginBottom: 14 }}>Type a name and the right number/email. This overrides whatever COVE has — fixes a wrong number instantly, across the whole app.</div>
        <label className="stat-label">Name</label>
        <input className="field mt-sm" placeholder="e.g. John Smith" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="stat-label mt"><Phone size={12} style={{ marginRight: 5, verticalAlign: "-1px" }} />Phone</label>
        <input className="field mt-sm" inputMode="tel" placeholder="(512) 555-0134" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label className="stat-label mt"><Mail size={12} style={{ marginRight: 5, verticalAlign: "-1px" }} />Email <span className="muted">(optional)</span></label>
        <input className="field mt-sm" inputMode="email" placeholder="john@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="flex gap-sm mt" style={{ alignItems: "center" }}>
          <button className="btn primary" onClick={save} disabled={busy}><Check size={15} /> {busy ? "Saving…" : "Save contact"}</button>
          {msg && <span style={{ color: "var(--green)", fontSize: 13 }}>{msg}</span>}
          {err && <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>}
        </div>
      </div>

      {/* Look up what COVE currently has */}
      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><Search /></span>Check a contact</div>
        <div className="stat-sub" style={{ marginBottom: 12 }}>See the number COVE currently has for someone — then “Fix” it if it’s wrong.</div>
        <div className="flex gap-sm">
          <input className="field" placeholder="Search a name or number…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn" onClick={search}>Search</button>
        </div>
        {!indexReady && <div className="stat-sub" style={{ marginTop: 8, color: "var(--amber)" }}>Contact index not loaded — you can still add contacts above.</div>}
        <div style={{ marginTop: 12 }}>
          {hits.map((h, i) => (
            <div className="row-item" key={i}>
              <div className="row-main">
                <div className="row-title">{h.name}</div>
                <div className="row-sub">{h.phone || "no phone"}{h.email ? ` · ${h.email}` : ""} <span className="muted">· {h.source}</span></div>
              </div>
              <button className="btn sm ghost" onClick={() => prefill(h.name, h.phone, h.email)}><Pencil size={13} /> Fix</button>
            </div>
          ))}
          {searched && hits.length === 0 && <div className="empty" style={{ fontSize: 13 }}>No match in the index. Add them on the left.</div>}
        </div>
      </div>

      {/* Your added/corrected contacts */}
      <div className="card pad-lg" style={{ gridColumn: "1 / -1" }}>
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><UserPlus /></span>Contacts you’ve added / fixed <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {added.length}</span></div>
        {added.length === 0 ? (
          <div className="empty" style={{ fontSize: 13 }}>Nothing added yet. Anything you add here wins over the imported list.</div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th></th></tr></thead>
            <tbody>
              {added.map((a) => (
                <tr key={a.name}>
                  <td style={{ fontWeight: 600 }}>{a.name}</td>
                  <td>{a.phone || <span className="muted">—</span>}</td>
                  <td>{a.email || <span className="muted">—</span>}</td>
                  <td className="num">
                    <button className="btn sm ghost" onClick={() => prefill(a.name, a.phone || "", a.email || "")} title="Edit"><Pencil size={13} /></button>
                    <button className="btn sm ghost" style={{ color: "var(--red)", marginLeft: 6 }} onClick={() => remove(a.name)} title="Remove"><X size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
