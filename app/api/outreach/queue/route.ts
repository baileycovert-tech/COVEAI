import { NextRequest, NextResponse } from "next/server";
import { getOutreachQueue, outreachQueueFor, writeData } from "../../../lib/data";
import { currentUser } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Owner slug of a draft (legacy drafts with no rep were all Bailey's).
const ownerOf = (d: { rep?: string }) => d.rep || "bailey-covert";

export async function GET() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // A rep only ever sees THEIR OWN queue — never another rep's drafts/customers.
  return NextResponse.json({ queue: outreachQueueFor(me.slug) });
}

// Update a draft: approve / mark sent / dismiss / edit body — only your own.
export async function PATCH(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, status, body, subject } = await req.json();
  const queue = getOutreachQueue();
  const idx = queue.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ownerOf(queue[idx]) !== me.slug) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  if (status) queue[idx].status = status;
  if (typeof body === "string") queue[idx].body = body;
  if (typeof subject === "string") queue[idx].subject = subject;
  writeData("outreach-queue.json", queue);
  return NextResponse.json({ draft: queue[idx] });
}

export async function DELETE(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await req.json();
  const queue = getOutreachQueue();
  const target = queue.find((d) => d.id === id);
  if (target && ownerOf(target) !== me.slug) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  writeData("outreach-queue.json", queue.filter((d) => d.id !== id));
  return NextResponse.json({ ok: true });
}
