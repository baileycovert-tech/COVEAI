"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sun, LayoutDashboard, KanbanSquare, Car, UserPlus, Menu, X,
  Sparkles, Users, Receipt, TrendingUp, Activity, LogOut, UserCog, BookUser,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";

type Item = { href: string; label: string; Icon: any; admin?: boolean; fin?: boolean };

// Bottom-bar primaries (max 4 + More) — same for everyone now.
const PRIMARY: Item[] = [
  { href: "/brief", label: "Brief", Icon: Sun },
  { href: "/", label: "Board", Icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", Icon: KanbanSquare },
  { href: "/inventory", label: "Inventory", Icon: Car },
];
const MORE: Item[] = [
  { href: "/leads/new", label: "Add Lead", Icon: UserPlus },
  { href: "/outreach", label: "AI Outreach", Icon: Sparkles },
  { href: "/customers", label: "Customers", Icon: Users },
  { href: "/contacts", label: "Contacts", Icon: BookUser },
  { href: "/sold", label: "Sold", Icon: Receipt },
  { href: "/metrics", label: "Metrics", Icon: TrendingUp },
  { href: "/health", label: "Data Health", Icon: Activity, admin: true },
  { href: "/setup", label: "Setup", Icon: UserCog },
];

export default function MobileChrome({ isAdmin, seesFinancials, name }: { isAdmin?: boolean; seesFinancials?: boolean; name: string }) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const primary = PRIMARY;
  const more = MORE.filter((i) => (!i.admin || isAdmin) && (!i.fin || seesFinancials) && !primary.some((p) => p.href === i.href));
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  async function signOut() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <>
      <header className="m-topbar">
        <span className="m-brand"><span className="brand-logo" style={{ width: 26, height: 26, fontSize: 14 }}>C</span> COVE</span>
      </header>

      <nav className="m-tabbar">
        {primary.map((t) => (
          <Link key={t.href} href={t.href} className={"m-tab" + (active(t.href) ? " on" : "")}>
            <t.Icon size={21} strokeWidth={active(t.href) ? 2.4 : 2} />
            <span>{t.label}</span>
          </Link>
        ))}
        <button className={"m-tab" + (moreOpen ? " on" : "")} onClick={() => setMoreOpen(true)} aria-label="More">
          <Menu size={21} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="m-sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div className="m-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="m-sheet-head">
              <strong>{name}</strong>
              <button className="icon-btn" onClick={() => setMoreOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            {more.length > 0 && (
              <div className="m-sheet-grid">
                {more.map((i) => (
                  <Link key={i.href} href={i.href} className="m-sheet-item" onClick={() => setMoreOpen(false)}>
                    <i.Icon size={20} />
                    <span>{i.label}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="m-sheet-foot">
              <ThemeToggle />
              <button className="btn ghost sm" onClick={signOut}><LogOut size={14} /> Sign out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
