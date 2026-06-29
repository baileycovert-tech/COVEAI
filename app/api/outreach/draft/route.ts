import { NextRequest, NextResponse } from "next/server";
import { outreachTargetsFor, getOutreachQueue, writeData, OutreachDraft } from "../../../lib/data";
import { draftMessage } from "../../../lib/anthropic";
import { currentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 403 });
  const { slug, channel = "text", intent = "" } = await req.json();
  // Resolve against the VIEWER's audience only — a rep can't draft to the owner's customers.
  const customer = outreachTargetsFor(me).find((c) => c.slug === slug);
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const drafted = await draftMessage({ customer, channel, intent });

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
  };

  const queue = getOutreachQueue();
  queue.unshift(entry);
  writeData("outreach-queue.json", queue);

  return NextResponse.json({ draft: entry });
}
