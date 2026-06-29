"use client";
import { useState } from "react";
import { FileText, Send, Check, Building2, Banknote, Loader2, ExternalLink, Trash2, CircleCheck } from "lucide-react";

type Stage = "ready" | "at_desk" | "at_finance" | "done";
type Jacket = {
  id: string; createdAt: string; type: "new" | "used"; dealNumber: string;
  customer: any; vehicle: any; trade?: any; pdfName: string; stage: Stage;
  desk: string; finance: string; history: { at: string; event: string }[];
};
type Routing = { desk: string; finance: string };

const STAGE: Record<Stage, { label: string; cls: string }> = {
  ready:      { label: "Ready to approve", cls: "" },
  at_desk:    { label: "At desk for approval", cls: "amber" },
  at_finance: { label: "With finance", cls: "new" },
  done:       { label: "Funded", cls: "green" },
};

const PEOPLE = [
  { alias: "evan", role: "Sales mgr / desking" }, { alias: "sidney", role: "Desking" },
  { alias: "mark", role: "Sales mgr" }, { alias: "ricardo", role: "Sales mgr" },
  { alias: "johnny", role: "F&I primary" }, { alias: "jose", role: "F&I" },
  { alias: "lorenzo", role: "F&I / appraisal" }, { alias: "stephen", role: "GSM" },
];

export default function CloseDealForm({ jackets: initial, routing }: { jackets: Jacket[]; routing: Routing }) {
  const [jackets, setJackets] = useState<Jacket[]>(initial);
  const [type, setType] = useState<"new" | "used">("used");
  const [c, setC] = useState<any>({});
  const [v, setV] = useState<any>({});
  const [t, setT] = useState<any>({});
  const [hasTrade, setHasTrade] = useState(false);
  const [dealNumber, setDealNumber] = useState("");
  const [desk, setDesk] = useState(routing.desk);
  const [finance, setFinance] = useState(routing.finance);
  const [photosDir, setPhotosDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [actId, setActId] = useState("");

  const upC = (k: string, val: string) => setC((o: any) => ({ ...o, [k]: val }));
  const upV = (k: string, val: string) => setV((o: any) => ({ ...o, [k]: val }));
  const upT = (k: string, val: string) => setT((o: any) => ({ ...o, [k]: val }));

  async function build() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/deals/jacket", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", type, customer: c, vehicle: v, trade: hasTrade ? t : undefined, dealNumber, desk, finance }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "Couldn't build the packet."); return; }
      setJackets((j) => [d.jacket, ...j]);
      setC({}); setV({}); setT({}); setHasTrade(false); setDealNumber("");
    } catch { setErr("Couldn't reach the server."); }
    finally { setBusy(false); }
  }

  async function act(id: string, action: string, extra: any = {}) {
    setActId(id + action); setErr("");
    try {
      const r = await fetch("/api/deals/jacket", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, photosDir: photosDir || undefined, ...extra }),
      });
      const d = await r.json();
      if (!d.ok) { setErr(d.error || "That didn't work."); return; }
      if (action === "delete") setJackets((j) => j.filter((x) => x.id !== id));
      else setJackets((j) => j.map((x) => (x.id === id ? d.jacket : x)));
    } catch { setErr("Couldn't reach the server."); }
    finally { setActId(""); }
  }

  const F = (label: string, k: string, get: any, set: any, ph = "", opts: any = {}) => (
    <div style={{ flex: opts.flex || 1, minWidth: opts.minWidth || 120 }}>
      <label className="stat-label" style={{ fontSize: 11 }}>{label}</label>
      <input className="field" value={get[k] || ""} placeholder={ph} inputMode={opts.inputMode}
        onChange={(e) => set(k, e.target.value)} style={{ marginTop: 3 }} />
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 760 }}>
      {/* ─── New deal ─── */}
      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><FileText /></span>New deal packet</div>
        <div className="stat-sub" style={{ marginBottom: 14 }}>COVE fills the {type === "new" ? "Ford New" : "Used"} packet, then you approve and route it. Nothing sends until you click approve.</div>

        <div className="flex" style={{ gap: 8, marginBottom: 14 }}>
          {(["used", "new"] as const).map((tp) => (
            <button key={tp} className={`btn ${type === tp ? "primary" : "ghost"} sm`} onClick={() => setType(tp)}>
              {tp === "new" ? "New (Ford)" : "Used"}
            </button>
          ))}
        </div>

        <div className="stat-label" style={{ marginBottom: 6 }}>Customer</div>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {F("First name", "first_name", c, upC, "Shay")}
          {F("Last name *", "last_name", c, upC, "Braun")}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {F("Phone", "phone", c, upC, "5125551234", { inputMode: "tel" })}
          {F("Email", "email", c, upC, "shay@example.com", { inputMode: "email" })}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {F("Address", "address", c, upC, "123 Ranch Rd", { flex: 2, minWidth: 200 })}
          {F("City", "city", c, upC, "Hutto")}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {F("State", "state", c, upC, "TX", { minWidth: 70 })}
          {F("ZIP", "zip", c, upC, "78634", { minWidth: 90 })}
          {F("DOB", "dob", c, upC, "01/01/1985", { minWidth: 110 })}
          {F("DL #", "dl_number", c, upC, "")}
        </div>

        <div className="stat-label" style={{ marginBottom: 6 }}>Vehicle</div>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {F("Year", "year", v, upV, "2026", { minWidth: 80, inputMode: "numeric" })}
          {F("Make", "make", v, upV, "Ford")}
          {F("Model", "model", v, upV, "F-150 XLT", { flex: 2, minWidth: 160 })}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {F("Stock # *", "stock", v, upV, "FP7681")}
          {F("VIN", "vin", v, upV, "1FT…", { flex: 2, minWidth: 200 })}
        </div>
        <div className="flex" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          {F("Color", "color", v, upV, "Oxford White")}
          {F("Miles", "miles", v, upV, "18450", { inputMode: "numeric" })}
          {F("Deal #", "_deal", { _deal: dealNumber }, (_: string, val: string) => setDealNumber(val), "134262")}
        </div>

        {!hasTrade ? (
          <button className="btn ghost sm" onClick={() => setHasTrade(true)} style={{ marginBottom: 14 }}>+ Add a trade-in</button>
        ) : (
          <>
            <div className="stat-label" style={{ marginBottom: 6 }}>Trade-in <button className="card-link" onClick={() => setHasTrade(false)} style={{ marginLeft: 8 }}>remove</button></div>
            <div className="flex" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              {F("Year", "year", t, upT, "2019", { minWidth: 80 })}
              {F("Make", "make", t, upT, "Toyota")}
              {F("Model", "model", t, upT, "Camry")}
            </div>
            <div className="flex" style={{ gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {F("VIN", "vin", t, upT, "", { flex: 2, minWidth: 200 })}
              {F("Color", "color", t, upT, "Silver")}
              {F("Miles", "miles", t, upT, "62000")}
            </div>
          </>
        )}

        <div className="flex" style={{ gap: 14, alignItems: "center" }}>
          <button className="btn primary" onClick={build} disabled={busy || !c.last_name || !v.stock}>
            {busy ? <Loader2 className="spin" size={15} /> : <FileText size={15} />} {busy ? "Filling packet…" : "Build packet"}
          </button>
          {err && <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>}
        </div>
      </div>

      {/* ─── Routing defaults ─── */}
      <div className="card pad-lg">
        <div className="card-title" style={{ marginBottom: 4 }}><span className="ico"><Building2 /></span>Where deals route</div>
        <div className="stat-sub" style={{ marginBottom: 12 }}>Who gets the packet for desk approval, then finance. You can override per-deal.</div>
        <div className="flex" style={{ gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 220 }}>
            <label className="stat-label" style={{ fontSize: 11 }}><Building2 size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Desk (approval)</label>
            <select className="field" value={desk} onChange={(e) => setDesk(e.target.value)} style={{ marginTop: 3 }}>
              {PEOPLE.map((p) => <option key={p.alias} value={p.alias}>{p.alias} — {p.role}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220 }}>
            <label className="stat-label" style={{ fontSize: 11 }}><Banknote size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />Finance (F&I)</label>
            <select className="field" value={finance} onChange={(e) => setFinance(e.target.value)} style={{ marginTop: 3 }}>
              {PEOPLE.map((p) => <option key={p.alias} value={p.alias}>{p.alias} — {p.role}</option>)}
            </select>
          </div>
          <div style={{ minWidth: 220, flex: 1 }}>
            <label className="stat-label" style={{ fontSize: 11 }}>Photos folder (optional)</label>
            <input className="field" value={photosDir} onChange={(e) => setPhotosDir(e.target.value)} placeholder="/path/to/deal-photos/braun" style={{ marginTop: 3 }} />
            <div className="stat-sub" style={{ fontSize: 11, marginTop: 3 }}>DL / insurance / odometer / trade photos auto-attach when you send.</div>
          </div>
        </div>
      </div>

      {/* ─── Deals in progress ─── */}
      <div>
        <div className="card-title" style={{ marginBottom: 10 }}><span className="ico"><Send /></span>Deals in progress</div>
        {jackets.length === 0 ? (
          <div className="card pad-lg stat-sub">No deals yet — build a packet above to get started.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {jackets.map((j) => {
              const name = `${j.customer.first_name || ""} ${j.customer.last_name || ""}`.trim();
              const veh = [j.vehicle.year, j.vehicle.make, j.vehicle.model].filter(Boolean).join(" ");
              const busyA = (a: string) => actId === j.id + a;
              return (
                <div key={j.id} className="card pad-lg">
                  <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <strong>{name || "—"}</strong> <span className="muted" style={{ fontSize: 13 }}>· {veh} · stock {j.vehicle.stock}{j.dealNumber ? ` · deal #${j.dealNumber}` : ""}</span>
                      <div className="stat-sub" style={{ marginTop: 2 }}>{j.history?.[j.history.length - 1]?.event}</div>
                    </div>
                    <span className={`badge ${STAGE[j.stage].cls}`}>{STAGE[j.stage].label}</span>
                  </div>

                  <div className="flex" style={{ gap: 8, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <a className="btn ghost sm" href={`/api/deals/pdf?id=${j.id}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Preview packet</a>

                    {j.stage === "ready" && (
                      <button className="btn primary sm" onClick={() => act(j.id, "send-desk", { desk })} disabled={busyA("send-desk")}>
                        {busyA("send-desk") ? <Loader2 className="spin" size={13} /> : <Building2 size={13} />} Approve & send to {j.desk}
                      </button>
                    )}
                    {j.stage === "at_desk" && (
                      <button className="btn primary sm" onClick={() => act(j.id, "send-finance", { finance })} disabled={busyA("send-finance")}>
                        {busyA("send-finance") ? <Loader2 className="spin" size={13} /> : <Banknote size={13} />} Desk approved → send to {j.finance}
                      </button>
                    )}
                    {j.stage === "at_finance" && (
                      <button className="btn primary sm" onClick={() => act(j.id, "done")} disabled={busyA("done")}>
                        {busyA("done") ? <Loader2 className="spin" size={13} /> : <CircleCheck size={13} />} Mark funded
                      </button>
                    )}
                    {j.stage === "done" && <span style={{ color: "var(--green)", fontSize: 13 }}><Check size={13} style={{ verticalAlign: "-2px" }} /> Funded & complete</span>}

                    <button className="btn ghost sm" style={{ color: "var(--red)", marginLeft: "auto" }} onClick={() => act(j.id, "delete")} disabled={busyA("delete")} aria-label="Delete"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
