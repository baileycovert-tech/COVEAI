"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { section: "Sell" },
  { href: "/", label: "Sales Board", ico: "📊" },
  { href: "/leads/new", label: "Add Lead", ico: "➕" },
  { href: "/pipeline", label: "Pipeline", ico: "🗂️", admin: true },
  { href: "/customers", label: "Customers", ico: "👥", admin: true },
  { href: "/outreach", label: "AI Outreach", ico: "✨", admin: true },
  { section: "Know" },
  { href: "/inventory", label: "Inventory", ico: "🚙" },
  { href: "/metrics", label: "Metrics", ico: "📈", admin: true },
  { href: "/health", label: "Data Health", ico: "🩺", admin: true },
];

export default function Sidebar({ name, title, isAdmin }: { name: string; title: string; isAdmin?: boolean }) {
  const path = usePathname();
  const items = NAV.filter((n) => !("admin" in n && n.admin) || isAdmin);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">C</div>
        <div>
          <div className="brand-name">Covert CRM</div>
          <div className="brand-sub">Live Sales Assistant</div>
        </div>
      </div>
      <nav className="nav">
        {items.map((n, i) =>
          "section" in n ? (
            <div className="nav-label" key={i}>{n.section}</div>
          ) : (
            <Link
              key={n.href}
              href={n.href!}
              className={"nav-item" + (path === n.href ? " active" : "")}
            >
              <span className="nav-ico">{n.ico}</span>
              {n.label}
            </Link>
          )
        )}
      </nav>
      <div className="nav-foot">
        <div className="who">{name}</div>
        <div className="role">{title}</div>
        <button className="btn ghost sm" style={{ width: "100%", justifyContent: "center", marginTop: 10 }}
          onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
