import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readSession, COOKIE } from "../../../lib/auth";
import { saveSub, pushToSlug } from "../../../lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = readSession(cookies().get(COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { subscription, test } = await req.json();
  if (!subscription?.endpoint) return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  saveSub(session.slug, subscription);
  if (test) {
    await pushToSlug(session.slug, { title: "Covert CRM ✅", body: "Notifications are on — you'll get new leads here.", url: "/" });
  }
  return NextResponse.json({ ok: true });
}
