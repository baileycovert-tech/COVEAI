"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export default function PushSetup({ vapidPublic }: { vapidPublic: string }) {
  const [state, setState] = useState<"idle" | "on" | "blocked" | "unsupported" | "needs-install" | "busy">("idle");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) { setState("unsupported"); return; }
    // iOS only allows push from an installed (home-screen) PWA.
    const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (window.matchMedia("(display-mode: standalone)").matches) || (navigator as any).standalone;
    if (iOS && !standalone) { setState("needs-install"); return; }
    if (Notification.permission === "granted") {
      navigator.serviceWorker.getRegistration().then((r) => {
        r?.pushManager.getSubscription().then((s) => setState(s ? "on" : "idle"));
      });
    } else if (Notification.permission === "denied") setState("blocked");
  }, []);

  async function enable() {
    try {
      setState("busy");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState("blocked"); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidPublic),
      });
      const r = await fetch("/api/push/subscribe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub, test: true }),
      });
      setState(r.ok ? "on" : "idle");
    } catch { setState("idle"); }
  }

  if (state === "on" || state === "unsupported") return null;

  return (
    <div className="push-bar">
      <span style={{ display: "inline-flex", color: "hsl(var(--primary))" }}><Bell size={16} /></span>
      {state === "needs-install" ? (
        <span>To get lead alerts on your phone: tap <strong>Share → Add to Home Screen</strong>, then open the app from your home screen and enable here.</span>
      ) : state === "blocked" ? (
        <span>Notifications are blocked in your browser settings. Allow them for this site to get lead alerts.</span>
      ) : (
        <>
          <span style={{ flex: 1 }}>Get a push the moment a new lead lands.</span>
          <button className="btn primary sm" onClick={enable} disabled={state === "busy"}>
            {state === "busy" ? "Enabling…" : "Enable lead alerts"}
          </button>
        </>
      )}
    </div>
  );
}
