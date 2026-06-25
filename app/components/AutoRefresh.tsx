"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Soft-refreshes the route every 60s so server components re-read the JSON
// the scheduled agent rewrites — the screen is never more than 60s stale.
export default function AutoRefresh({ lastSync }: { lastSync?: string }) {
  const router = useRouter();
  const [ago, setAgo] = useState<string>("just now");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const refresh = setInterval(() => router.refresh(), 60_000);
    const clock = setInterval(() => setTick((t) => t + 1), 1000);
    return () => { clearInterval(refresh); clearInterval(clock); };
  }, [router]);

  useEffect(() => {
    if (!lastSync) return;
    const then = new Date(lastSync.includes("T") ? lastSync : lastSync + "T00:00:00").getTime();
    const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (secs < 90) setAgo("just now");
    else if (secs < 3600) setAgo(`${Math.round(secs / 60)}m ago`);
    else if (secs < 86400) setAgo(`${Math.round(secs / 3600)}h ago`);
    else setAgo(`${Math.round(secs / 86400)}d ago`);
  }, [lastSync, tick]);

  return (
    <div className="autorefresh" title="Screen auto-refreshes every 60 seconds">
      <span className="dot live" /> Live · data synced {ago}
    </div>
  );
}
