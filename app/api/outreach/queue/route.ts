import { NextRequest, NextResponse } from "next/server";
import { getOutreachQueue, writeData } from "../../../lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ queue: getOutreachQueue() });
}

// Update a draft: approve / mark sent / dismiss / edit body
export async function PATCH(req: NextRequest) {
  const { id, status, body, subject } = await req.json();
  const queue = getOutreachQueue();
  const idx = queue.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (status) queue[idx].status = status;
  if (typeof body === "string") queue[idx].body = body;
  if (typeof subject === "string") queue[idx].subject = subject;
  writeData("outreach-queue.json", queue);
  return NextResponse.json({ draft: queue[idx] });
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  const queue = getOutreachQueue().filter((d) => d.id !== id);
  writeData("outreach-queue.json", queue);
  return NextResponse.json({ ok: true });
}
