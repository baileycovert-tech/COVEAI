"use client";
import { useEffect, useRef, useState } from "react";
import { Search, UserPlus, Phone, Mail, MessageSquare, X, Check, Pencil, BadgeCheck, Car } from "lucide-react";

type Hit = { name: string; phone: string; email: string; source: string };
type Added = { name: string; phone: string | null; email: string | null; at: string };
type Buyer = { name: string; vehicle: string; soldAt: string; purchases: number; phone: string; email: string };

const digits = (s?: string | null) => (s || "").replace(/[^\d]/g, "");
const nkey = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((t) => t.length > 1).sort().join(" ");
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (s: string) => {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  if (!y || !m) return s;
  return `${MON[(+m || 1) - 1]} ${+d || ""}, ${y}`;
};
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Tap-to-reach buttons (real phone/email links so they work on the iPhone PWA).
function Reach({ phone, email }: { phone?: string; email?: string }) {
  const p = digits(phone);
  if (!p && !email) return <span className="muted" style={{ fontSize: 12 }}>no contact on file</span>;
  return (
    <div className="flex" style={{ gap: 6 }}>
      {p && <a className="btn sm ghost" href={`tel:${p}`} title="Call"><Phone size={13} /></a>}
      {p && <a className="btn sm ghost" href={`sms:${p}`} title="Text"><MessageSquare size={13} /></a>}
      {email && <a className="btn sm ghost" href={`mailto:${email}`} title="Email"><Mail size={13} /></a>}
    </div>
  );
}

export default function ContactsClient({
  initial, indexReady, buyers,
}: { initial: Added[]; indexReady: boolean; buyers: Buyer[] }) {
  const [tab, setTab] = useState<"buyers" | "all" | "added">("buyers");
  const [added, setAdded] = useState<Added[]>(initial);

  // search (debounced, runs across all tabs)
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searched, setSearched] = useState(false);

  // browse-all (paged)
  const [browse, setBrowse] = useState<Hit[]>([]);
  const [letter, setLetter] = useState("");
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  // add / fix form
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const buyerKeys = useRef<Set<string>>(new Set(buyers.map((b) => nkey(b.name))));
  const isBuyer = (n: string) => buyerKeys.current.has(nkey(n));

  // live search
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); setSearched(false); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch("/api/contacts?q=" + encodeURIComponent(q.trim()));
        const d = await r.json();
        setHits(d.indexMatches || []);
        setSearched(true);
      } catch { /* keep last */ }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function loadBrowse(reset: boolean, ltr = letter) {
    setLoadingMore(true);
    const offset = reset ? 0 : browse.length;
    try {
      const r = await fetch(`/api/contacts?browse=1&offset=${offset}&letter=${ltr}`);
      const d = await r.json();
      setTotal(d.total || 0);
      setBrowse(reset ? d.rows || [] : [...browse, ...(d.rows || [])]);
    } catch { /* ignore */ }
    finally { setLoadingMore(false); }
  }
  useEffect(() => {
    if (tab === "all" && browse.length === 0 && !letter) loadBrowse(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  function pickLetter(l: string) {
    const nl = l === letter ? "" : l;
    setLetter(nl); setBrowse([]); loadBrowse(true, nl);
  }

  function prefill(n: string, p = "", e = "") {
    setName(n); setPhone(p); setEmail(e); setMsg(""); setErr(""); setAddOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function save() {
    if (!name.trim()) { setErr("Enter a name."); return; }
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch("/api/contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() }),
      });
      const d = await r.json();
      if (d.ok) { setAdded(d.added); setMsg(`Saved — COVE will use this for ${name.trim()}.`); setName(""); setPhone(""); setEmail(""); }
      else setErr(d.error || "Couldn't save.");
    } catch { setErr("Couldn't reach the server."); }
    finally { setBusy(false); }
  }
  async function remove(n: string) {
    const r = await fetch("/api/contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, remove: true }),
    });
    const d = await r.json();
    if (d.ok) setAdded(d.added);
  }

  const searchingNow = q.trim().length >= 2;

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* Search + add toggle */}
      <div className="card pad-lg">
        <div className="flex gap-sm" style={{ alignItems: "center" }}>
          <span className="ico" style={{ flex: "0 0 auto" }}><Search /></span>
          <input
            className="field" style={{ flex: 1 }}
            placeholder="Search anyone — name, email, or full phone number…"
            value={q} onChange={(e) => setQ(e.target.value)}
          />
          {q && <button className="btn ghost" onClick={() => setQ("")}><X size={15} /></button>}
          <button className="btn" onClick={() => { setAddOpen((v) => !v); if (!addOpen) { setName(""); setPhone(""); setEmail(""); setMsg(""); setErr(""); } }}>
            <UserPlus size={15} /> Add / fix
          </button>
        </div>
        {!indexReady && <div className="stat-sub" style={{ marginTop: 8, color: "var(--amber)" }}>Contact index not loaded — you can still add contacts.</div>}

        {addOpen && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <div className="stat-sub" style={{ marginBottom: 10 }}>Type a name and the right number/email — your entry overrides whatever COVE has, everywhere.</div>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div><label className="stat-label">Name</label><input className="field mt-sm" placeholder="John Smith" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div><label className="stat-label"><Phone size={12} style={{ marginRight: 5, verticalAlign: "-1px" }} />Phone</label><input className="field mt-sm" inputMode="tel" placeholder="(512) 555-0134" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
              <div style={{ gridColumn: "1 / -1" }}><label className="stat-label"><Mail size={12} style={{ marginRight: 5, verticalAlign: "-1px" }} />Email <span className="muted">(optional)</span></label><input className="field mt-sm" inputMode="email" placeholder="john@email.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
            <div className="flex gap-sm mt" style={{ alignItems: "center" }}>
              <button className="btn primary" onClick={save} disabled={busy}><Check size={15} /> {busy ? "Saving…" : "Save contact"}</button>
              {msg && <span style={{ color: "var(--green)", fontSize: 13 }}>{msg}</span>}
              {err && <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Search results (override the tabs while searching) */}
      {searchingNow ? (
        <div className="card pad-lg">
          <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Search /></span>Results for “{q.trim()}”</div>
          <div style={{ maxHeight: "64vh", overflowY: "auto" }}>
            {hits.map((h, i) => (
              <div className="row-item" key={i}>
                <div className="row-main">
                  <div className="row-title">{h.name} {isBuyer(h.name) && <span className="badge green" style={{ marginLeft: 6 }}><BadgeCheck size={12} /> Bought</span>}</div>
                  <div className="row-sub">{h.phone || "no phone"}{h.email ? ` · ${h.email}` : ""} <span className="muted">· {h.source}</span></div>
                </div>
                <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                  <Reach phone={h.phone} email={h.email} />
                  <button className="btn sm ghost" onClick={() => prefill(h.name, h.phone, h.email)} title="Fix"><Pencil size={13} /></button>
                </div>
              </div>
            ))}
            {searched && hits.length === 0 && <div className="empty" style={{ fontSize: 13 }}>No match. Tap “Add / fix” to add them.</div>}
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex gap-sm" style={{ flexWrap: "wrap" }}>
            <button className={"btn" + (tab === "buyers" ? " primary" : "")} onClick={() => setTab("buyers")}>Past buyers <span className="muted">· {buyers.length}</span></button>
            <button className={"btn" + (tab === "all" ? " primary" : "")} onClick={() => setTab("all")}>All contacts</button>
            <button className={"btn" + (tab === "added" ? " primary" : "")} onClick={() => setTab("added")}>Added by me <span className="muted">· {added.length}</span></button>
          </div>

          {/* PAST BUYERS — the rolodex with context */}
          {tab === "buyers" && (
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><BadgeCheck /></span>People you’ve sold <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {buyers.length}, newest first</span></div>
              <div className="stat-sub" style={{ marginBottom: 10 }}>Your book of past buyers — what they bought and when. Tap to call, text, or email.</div>
              {buyers.length === 0 ? (
                <div className="empty" style={{ fontSize: 13 }}>No sold history loaded yet — it builds from the DMS on the next refresh.</div>
              ) : (
                <div style={{ maxHeight: "66vh", overflowY: "auto" }}>
                  {buyers.map((b, i) => (
                    <div className="row-item" key={i}>
                      <div className="row-main">
                        <div className="row-title">
                          {b.name}
                          {b.purchases > 1 && <span className="badge green" style={{ marginLeft: 6 }}>{b.purchases}× buyer</span>}
                        </div>
                        <div className="row-sub">
                          <Car size={12} style={{ verticalAlign: "-2px", marginRight: 4, opacity: 0.7 }} />
                          {b.vehicle || "vehicle n/a"}{b.soldAt ? <span className="muted"> · {fmtDate(b.soldAt)}</span> : null}
                          {(b.phone || b.email) && <span className="muted"> · {b.phone || b.email}</span>}
                        </div>
                      </div>
                      <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                        <Reach phone={b.phone} email={b.email} />
                        <button className="btn sm ghost" onClick={() => prefill(b.name, b.phone, b.email)} title="Fix contact"><Pencil size={13} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ALL CONTACTS — A–Z browse */}
          {tab === "all" && (
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 8 }}><span className="ico"><UserPlus /></span>All contacts <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {total.toLocaleString()}{letter ? ` starting “${letter}”` : ""}</span></div>
              <div className="flex" style={{ gap: 3, flexWrap: "wrap", marginBottom: 10 }}>
                <button className={"btn sm" + (letter === "" ? " primary" : " ghost")} onClick={() => pickLetter("")}>All</button>
                {ALPHA.map((l) => (
                  <button key={l} className={"btn sm" + (letter === l ? " primary" : " ghost")} style={{ minWidth: 30, padding: "4px 6px" }} onClick={() => pickLetter(l)}>{l}</button>
                ))}
              </div>
              <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                {browse.map((h, i) => (
                  <div className="row-item" key={i}>
                    <div className="row-main">
                      <div className="row-title">{h.name} {isBuyer(h.name) && <span className="badge green" style={{ marginLeft: 6 }}><BadgeCheck size={12} /> Bought</span>}</div>
                      <div className="row-sub">{h.phone || "no phone"}{h.email ? ` · ${h.email}` : ""}</div>
                    </div>
                    <div className="flex" style={{ gap: 8, alignItems: "center" }}>
                      <Reach phone={h.phone} email={h.email} />
                      <button className="btn sm ghost" onClick={() => prefill(h.name, h.phone, h.email)} title="Fix"><Pencil size={13} /></button>
                    </div>
                  </div>
                ))}
                {browse.length === 0 && !loadingMore && <div className="empty" style={{ fontSize: 13 }}>No contacts here.</div>}
                {browse.length > 0 && browse.length < total && (
                  <div style={{ textAlign: "center", marginTop: 12 }}>
                    <button className="btn" onClick={() => loadBrowse(false)} disabled={loadingMore}>{loadingMore ? "Loading…" : `Load more (${browse.length.toLocaleString()} of ${total.toLocaleString()})`}</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ADDED BY ME */}
          {tab === "added" && (
            <div className="card pad-lg">
              <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><UserPlus /></span>Contacts you’ve added / fixed <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>— {added.length}</span></div>
              {added.length === 0 ? (
                <div className="empty" style={{ fontSize: 13 }}>Nothing added yet. Anything you add wins over the imported list.</div>
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
          )}
        </>
      )}
    </div>
  );
}
