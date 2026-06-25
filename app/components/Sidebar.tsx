"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, UserPlus, KanbanSquare, Users, Sparkles,
  Car, TrendingUp, Activity, LogOut,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

type NavItem = { href: string; label: string; Icon: any; admin?: boolean };
type NavSection = { section: string };
type NavEntry = NavItem | NavSection;

const NAV: NavEntry[] = [
  { section: "Sell" },
  { href: "/", label: "Sales Board", Icon: LayoutDashboard },
  { href: "/leads/new", label: "Add Lead", Icon: UserPlus },
  { href: "/pipeline", label: "Pipeline", Icon: KanbanSquare, admin: true },
  { href: "/customers", label: "Customers", Icon: Users, admin: true },
  { href: "/outreach", label: "AI Outreach", Icon: Sparkles, admin: true },
  { section: "Know" },
  { href: "/inventory", label: "Inventory", Icon: Car },
  { href: "/metrics", label: "Metrics", Icon: TrendingUp, admin: true },
  { href: "/health", label: "Data Health", Icon: Activity, admin: true },
];

export default function Sidebar({ name, title, isAdmin }: { name: string; title: string; isAdmin?: boolean }) {
  const path = usePathname();
  const items = NAV.filter((n) => !("admin" in n && n.admin) || isAdmin);
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-logo">C</div>
        <div>
          <div className="brand-name">COVE</div>
          <div className="brand-sub">Your AI Sales Assistant</div>
        </div>
      </div>
      <nav className="nav">
        {items.map((n, i) =>
          "section" in n ? (
            <div className="nav-label" key={i}>{n.section}</div>
          ) : (
            <Link
              key={n.href}
              href={n.href}
              className={"nav-item" + (path === n.href ? " active" : "")}
            >
              <span className="nav-ico"><n.Icon strokeWidth={2} /></span>
              {n.label}
            </Link>
          )
        )}
      </nav>
      <div className="nav-foot">
        <div className="nav-card">
          <div className="flex between">
            <div style={{ minWidth: 0 }}>
              <div className="who">{name}</div>
              <div className="role">{title}</div>
            </div>
            <ThemeToggle />
          </div>
          <button
            className="btn ghost sm"
            style={{ width: "100%", justifyContent: "center", marginTop: 10, gap: 6 }}
            onClick={async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; }}
          >
            <LogOut /> Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
