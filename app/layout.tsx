import "./globals.css";
import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Sidebar from "./components/Sidebar";
import AutoRefresh from "./components/AutoRefresh";
import PushSetup from "./components/PushSetup";
import ThemeProvider from "./components/ThemeProvider";
import AskWidget from "./components/AskWidget";
import MobileChrome from "./components/MobileChrome";
import { getProfile } from "./lib/data";
import { readSession, COOKIE, getUserBySlug, elevated } from "./lib/auth";

export const metadata: Metadata = {
  title: "COVE — Your AI Sales Assistant",
  description: "Bailey Covert's live car-sales CRM, pipeline, and AI outreach.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "COVE",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0e16",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover", // let content extend under the notch/home bar; we pad with safe-area insets
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const session = readSession(cookies().get(COOKIE)?.value);
  const p = getProfile();

  // Logged out (only the login page is reachable) — render bare, no app shell.
  if (!session) {
    return (
      <html lang="en" suppressHydrationWarning>
        <body>
          <ThemeProvider>{children}</ThemeProvider>
        </body>
      </html>
    );
  }

  const u = getUserBySlug(session.slug);
  const isAdmin = !!u?.isAdmin;
  const seesFinancials = elevated(u);
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <div className="app">
            <Sidebar name={session.name} title="Covert Auto Group — Hutto" isAdmin={isAdmin} seesFinancials={seesFinancials} />
            <MobileChrome name={session.name} isAdmin={isAdmin} seesFinancials={seesFinancials} />
            <main className="main">
              <AutoRefresh lastSync={p.lastSync} />
              <PushSetup vapidPublic={process.env.NEXT_PUBLIC_VAPID_PUBLIC || ""} />
              {children}
            </main>
          </div>
          {seesFinancials && <AskWidget />}
        </ThemeProvider>
      </body>
    </html>
  );
}
