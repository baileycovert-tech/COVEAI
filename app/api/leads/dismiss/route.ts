import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import path from "path";
import { currentUser } from "../../../lib/auth";
import { setOverride, getRemoved } from "../../../lib/leads-state";

export const dynamic = "force-dynamic";

// Click a lead out of the board (on=true → "remove") or restore it (on=false → "keep", which
// also overrides a sold-name match). Rebuilds the pipeline so the change shows immediately.
export async function POST(req: NextRequest) {
  if (!currentUser()?.isAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const { name, on = true } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "A lead name is required." }, { status: 400 });
  }
  setOverride(name, on ? "remove" : "keep");
  await new Promise<void>((resolve) => {
    execFile(process.execPath, [path.join(process.cwd(), "scripts", "build-crm.mjs")], { timeout: 30000 }, () => resolve());
  });
  return NextResponse.json({ ok: true, name, removed: !!on });
}

export async function GET() {
  if (!currentUser()?.isAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json({ ok: true, removed: getRemoved() });
}
