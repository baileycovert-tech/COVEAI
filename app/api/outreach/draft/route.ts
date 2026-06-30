import { NextRequest, NextResponse } from "next/server";
import { outreachTargetsFor, getOutreachQueue, getThreadForCustomer, writeData, OutreachDraft } from "../../../lib/data";
import { draftMessage } from "../../../lib/anthropic";
import { currentUser, getUserBySlug } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 403 });
  const { slug, channel = "text", intent = "" } = await req.json();
  // Resolve against the VIEWER's audience only — a rep can't draft to the owner's customers.
  const customer = outreachTargetsFor(me).find((c) => c.slug === slug);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const repName = getUserBySlug(me.slug)?.name || undefined; // draft in THIS rep's voice
  // Stage-aware: feed the customer's most recent inbound so the draft fits where the deal is.
  const lastInbound = getThreadForCustomer(customer, me.slug).filter((m) => m.dir === "in").slice(-1)[0]?.text;
  const drafted = await draftMessage({ customer, channel, intent, repName, lastInbound });

  const entry: OutreachDraft = {
    id: `${slug}-${Date.now()}`,
    customer: customer.name,
    slug,
    channel,
    subject: drafted.subject,
    body: drafted.body,
    status: "draft",
    createdAt: new Date().toISOString(),
    rationale: intent || customer.next_step || "Re-engage and advance the deal",
    generatedBy: drafted.generatedBy,
    rep: me.slug,
  };

  const queue = getOutreachQueue();
  queue.unshift(entry);
  writeData("outreach-queue.json", queue);

  return NextResponse.json({ draft: entry });
}
