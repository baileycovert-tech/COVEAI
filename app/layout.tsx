import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Sidebar from "./components/Sidebar";
import AutoRefresh from "./components/AutoRefresh";
import PushSetup from "./components/PushSetup";
import { getProfile } from "./lib/data";
import { readSession, COOKIE, getUserBySlug } from "./lib/auth";

export const metadata: Metadata = {
  title: "Covert CRM — Live Sales Assistant",
  description: "Bailey Covert's live car-sales CRM, pipeline, and AI outreach.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Covert CRM",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0f17",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = readSession(cookies().get(COOKIE)?.value);
  const p = getProfile();

  // Logged out (only the login page is reachable) — render bare, no app shell.
  if (!session) {
    return (
      <html lang="en">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="en">
      <body>
        <div className="app">
          <Sidebar name={session.name} title="Covert Auto Group — Hutto" isAdmin={!!getUserBySlug(session.slug)?.isAdmin} />
          <main className="main">
            <AutoRefresh lastSync={p.lastSync} />
            <PushSetup vapidPublic={process.env.NEXT_PUBLIC_VAPID_PUBLIC || ""} />
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
