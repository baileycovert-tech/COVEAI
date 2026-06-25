"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { InvUnit } from "../lib/data";

const money = (n: number | null) => (n == null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));

export default function InventorySearch({ units }: { units: InvUnit[] }) {
  const [q, setQ] = useState("");
  const [store, setStore] = useState<"all" | "Ford" | "Chevy" | "Used">("all");
  const [age, setAge] = useState<"all" | "fresh" | "aged">("all");
  const [sort, setSort] = useState<"age" | "price-hi" | "price-lo">("age");
  const [limit, setLimit] = useState(60);

  const filtered = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    let out = units.filter((u) => {
      if (store !== "all" && u.store !== store) return false;
      if (age === "fresh" && u.age > 30) return false;
      if (age === "aged" && u.age < 120) return false;
      if (!terms.length) return true;
      const hay = `${u.stock} ${u.vin} ${u.year} ${u.make || ""} ${u.model} ${u.trim} ${u.ext} ${u.int} ${u.store} ${u.condition || ""} ${u.status}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    out = out.sort((a, b) =>
      sort === "age" ? a.age - b.age : sort === "price-hi" ? (b.price || 0) - (a.price || 0) : (a.price || 0) - (b.price || 0)
    );
    return out;
  }, [units, q, store, age, sort]);

  const Chip = ({ on, onClick, children }: any) => (
    <button onClick={onClick} className={"pill" + (on ? " chip-on" : "")} style={{ cursor: "pointer", border: on ? "1px solid hsl(var(--primary))" : undefined, color: on ? "hsl(var(--primary))" : undefined }}>
      {children}
    </button>
  );

  return (
    <div className="card pad-lg section-gap">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <div className="card-title"><span className="ico"><Search /></span>Search the lot</div>
        <span className="muted" style={{ fontSize: 12 }}>{filtered.length} of {units.length} units</span>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}>
        <span style={{ position: "absolute", left: 12, top: 11, color: "hsl(var(--faint))" }}><Search size={16} /></span>
        <input
          className="field"
          style={{ paddingLeft: 36 }}
          placeholder="Search stock #, VIN, color, model, trim…  (e.g. “red bronco”, “260897”, “avalanche f-150”)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(60); }}
          autoFocus
        />
        {q && <button onClick={() => setQ("")} style={{ position: "absolute", right: 10, top: 9, background: "none", border: "none", cursor: "pointer", color: "hsl(var(--faint))" }}><X size={16} /></button>}
      </div>

      <div className="flex wrap" style={{ gap: 8, marginBottom: 14 }}>
        <Chip on={store === "all"} onClick={() => setStore("all")}>All</Chip>
        <Chip on={store === "Ford"} onClick={() => setStore("Ford")}>Ford (new)</Chip>
        <Chip on={store === "Chevy"} onClick={() => setStore("Chevy")}>Chevy (new)</Chip>
        <Chip on={store === "Used"} onClick={() => setStore("Used")}>Used (all makes)</Chip>
        <span style={{ width: 1, background: "hsl(var(--border))", margin: "0 4px" }} />
        <Chip on={age === "all"} onClick={() => setAge("all")}>Any age</Chip>
        <Chip on={age === "fresh"} onClick={() => setAge("fresh")}>Fresh (≤30d)</Chip>
        <Chip on={age === "aged"} onClick={() => setAge("aged")}>Aged (120d+)</Chip>
        <span style={{ width: 1, background: "hsl(var(--border))", margin: "0 4px" }} />
        <select className="field" style={{ width: "auto", padding: "6px 10px" }} value={sort} onChange={(e) => setSort(e.target.value as any)}>
          <option value="age">Newest on lot</option>
          <option value="price-hi">Price: high → low</option>
          <option value="price-lo">Price: low → high</option>
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr><th>Stock</th><th>Vehicle</th><th>Color</th><th className="num">List</th><th className="num">Age</th><th>Status</th><th>VIN</th></tr>
          </thead>
          <tbody>
            {filtered.slice(0, limit).map((u) => (
              <tr key={u.stock + u.vin}>
                <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{u.stock}</td>
                <td>
                  {u.year} {u.store === "Used" && u.make ? titleCase(u.make) + " " : ""}{u.model} {u.trim && <span className="muted">{u.trim}</span>}
                  <span className={"badge " + (u.store === "Ford" ? "ford" : u.store === "Chevy" ? "chevy" : "used")} style={{ marginLeft: 6 }}>{u.store === "Used" ? "Used" : u.store}</span>
                  {u.mileage ? <span className="muted" style={{ fontSize: 11 }}> · {Math.round(u.mileage / 1000)}k mi</span> : null}
                </td>
                <td>{titleCase(u.ext) || "—"}{titleCase(u.int) ? <span className="muted" style={{ fontSize: 11 }}> / {titleCase(u.int)}</span> : null}</td>
                <td className="num">{money(u.price)}</td>
                <td className="num">{u.age}d {u.age >= 120 ? <span className="badge aged" style={{ marginLeft: 4 }}>aged</span> : u.age <= 14 ? <span className="badge green" style={{ marginLeft: 4 }}>new</span> : null}</td>
                <td><span className="muted" style={{ fontSize: 11 }}>{u.status}</span></td>
                <td><span className="muted" style={{ fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{u.vin?.slice(-8)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <div className="empty">No units match “{q}”.</div>}
      {filtered.length > limit && (
        <button className="btn ghost sm" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={() => setLimit((l) => l + 100)}>
          Show {Math.min(100, filtered.length - limit)} more ({filtered.length - limit} left)
        </button>
      )}
    </div>
  );
}

function titleCase(s: string) {
  if (!s || /^nan$/i.test(s)) return "";
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
