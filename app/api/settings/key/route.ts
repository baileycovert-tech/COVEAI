import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

const ENV = path.join(process.cwd(), ".env.local");

// GET → is a key already active? Any signed-in user may CHECK (so the chatbot, which runs on the
// one shared server key for everyone, doesn't nag reps to paste a key). Only admins may SET one.
export async function GET() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ hasKey: !!process.env.ANTHROPIC_API_KEY, canEdit: !!me.isAdmin });
}

// POST { key } → save the Anthropic key to .env.local AND activate it live (no restart).
// Admin-only. The key is entered in the app UI, never in chat; .env.local is gitignored.
export async function POST(req: NextRequest) {
  if (!currentUser()?.isAdmin) return NextResponse.json({ error: "admin only" }, { status: 403 });
  const { key } = await req.json().catch(() => ({}));
  const k = String(key || "").trim();
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k)) {
    return NextResponse.json({ ok: false, error: "That doesn't look like an Anthropic key — it should start with sk-ant- and be long." }, { status: 400 });
  }
  try {
    let lines: string[] = [];
    try { lines = fs.readFileSync(ENV, "utf8").split("\n").filter((l) => !l.startsWith("ANTHROPIC_API_KEY=")); } catch {}
    lines.push(`ANTHROPIC_API_KEY=${k}`);
    fs.writeFileSync(ENV, lines.filter((l) => l.trim() !== "").join("\n") + "\n");
    process.env.ANTHROPIC_API_KEY = k; // live for this process — chatbot + outreach work immediately
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
