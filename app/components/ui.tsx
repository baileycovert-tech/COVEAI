import React from "react";

export function PageHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function LivePill({ text }: { text: string }) {
  return (
    <span className="pill">
      <span className="dot live" /> {text}
    </span>
  );
}

// Honest freshness pill: green only when data really is current. When stale/stopped
// it says so and links to Data Health, so the header never lies about liveness.
export function FreshPill({
  status,
  label,
}: {
  status: "live" | "stale" | "old" | "unavailable";
  label: string;
}) {
  const map = {
    live: { dot: "dot live", text: `Live · updated ${label}` },
    stale: { dot: "dot amber", text: `Stale · updated ${label}` },
    old: { dot: "dot red", text: `Not refreshing · last ${label}` },
    unavailable: { dot: "dot off", text: "No live data" },
  } as const;
  const m = map[status];
  return (
    <a href="/health" className="pill" style={{ textDecoration: "none" }} title="Open Data Health">
      <span className={m.dot} /> {m.text}
    </a>
  );
}

export function StatCard({
  label, value, unit, sub, progress, progressGreen, ico,
}: {
  label: string; value: string; unit?: string; sub?: React.ReactNode;
  progress?: number; progressGreen?: boolean; ico?: string;
}) {
  return (
    <div className="card">
      <div className="stat-label">{ico && <span>{ico}</span>}{label}</div>
      <div className="stat-value">
        {value}{unit && <small> {unit}</small>}
      </div>
      {progress != null && (
        <div className={"progress" + (progressGreen ? " green" : "")}>
          <span style={{ width: `${Math.max(2, progress)}%` }} />
        </div>
      )}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// Stacked bar chart: new (bottom) + used (top) units per month
export function UnitsChart({
  data,
}: {
  data: { label: string; newUnits: number; usedUnits: number }[];
}) {
  const max = Math.max(...data.map((d) => d.newUnits + d.usedUnits), 1);
  return (
    <div>
      <div className="chart">
        {data.map((d) => {
          const total = d.newUnits + d.usedUnits;
          return (
            <div className="bar-col" key={d.label}>
              <div className="bar-val">{total}</div>
              <div className="bar-stack" style={{ height: `${(total / max) * 100}%` }}>
                <div className="bar-seg newseg" style={{ height: `${(d.newUnits / total) * 100}%` }} />
                <div className="bar-seg usedseg" style={{ height: `${(d.usedUnits / total) * 100}%` }} />
              </div>
              <div className="bar-x">{d.label}</div>
            </div>
          );
        })}
      </div>
      <div className="legend" style={{ marginTop: 10 }}>
        <span><i className="swatch" style={{ background: "var(--accent)" }} /> New</span>
        <span><i className="swatch" style={{ background: "var(--purple)" }} /> Used</span>
      </div>
    </div>
  );
}

// Simple SVG line/area chart for gross trend
export function GrossTrend({ points }: { points: { label: string; value: number }[] }) {
  const w = 560, h = 180, pad = 28;
  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(...points.map((p) => p.value), 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1 || 1);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${h - pad} L ${x(0)} ${h - pad} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="ga" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(59,130,246,.35)" />
          <stop offset="100%" stopColor="rgba(59,130,246,0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#ga)" />
      <path d={line} fill="none" stroke="var(--accent-2)" strokeWidth="2.5" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.value)} r="3.2" fill="var(--accent-2)" />
          <text x={x(i)} y={h - 8} fontSize="10" fill="var(--text-faint)" textAnchor="middle">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function Avatar({ name, me }: { name: string; me?: boolean }) {
  const init = name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return <div className={"avatar" + (me ? " me" : "")}>{init || "?"}</div>;
}
