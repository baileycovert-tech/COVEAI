import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { currentUser, getUserBySlug } from "../../lib/auth";
import { getUserProfile, setUserProfile } from "../../lib/user-profile";
import { getSendingStatus, setSending } from "../../lib/user-sending";

export const dynamic = "force-dynamic";

// Confirm the App Password actually authenticates (IMAP read + SMTP send) before we save it,
// so the walkthrough only says "connected" when COVE can truly reach the inbox. Password goes
// in over stdin — never argv (which is visible in the process list).
function verifyGmail(user: string, pass: string): Promise<{ ok: boolean; error?: string; warn?: string; smtp?: boolean }> {
  return new Promise((resolve) => {
    const script = path.join(process.cwd(), "scripts", "verify-gmail.py");
    const p = spawn("/usr/bin/python3", [script, user], { stdio: ["pipe", "pipe", "pipe"] });
    let outBuf = "", errBuf = "";
    const timer = setTimeout(() => { p.kill(); resolve({ ok: false, error: "Verification timed out reaching Gmail." }); }, 30000);
    p.stdout.on("data", (d) => (outBuf += d));
    p.stderr.on("data", (d) => (errBuf += d));
    p.on("close", () => {
      clearTimeout(timer);
      try { resolve(JSON.parse(outBuf.trim().split("\n").pop() || "{}")); }
      catch { resolve({ ok: false, error: errBuf.trim() || "Couldn't verify the App Password." }); }
    });
    p.on("error", (e) => { clearTimeout(timer); resolve({ ok: false, error: `Verifier failed to start: ${e.message}` }); });
    p.stdin.write(pass); p.stdin.end();
  });
}

const cleanPhone = (raw: string): string | null => {
  const d = String(raw || "").replace(/[^\d]/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (!ten) return null;
  if (ten.length !== 10) return "INVALID";
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
};
const okEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim());

export async function GET() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const u = getUserBySlug(me.slug);
  return NextResponse.json({
    ok: true,
    name: me.name,
    s1: { ford: u?.fordS1 || null, chevy: u?.chevyS1 || null },
    profile: getUserProfile(me.slug),
    sending: getSendingStatus(me.slug),
  });
}

// Save the signed-in rep's own phone(s) + email(s).
export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  // Connect/disconnect the rep's Gmail so COVE reads their inbox + sends as them (separate action).
  if (body.action === "sending") {
    const gmailUser = String(body.gmailUser || "").trim();
    if (gmailUser && !okEmail(gmailUser)) return NextResponse.json({ error: "Enter a valid Gmail address." }, { status: 400 });
    // When a NEW password is supplied, prove it authenticates before storing it.
    const pass = String(body.appPassword || "").trim();
    let warn: string | undefined;
    if (gmailUser && pass) {
      const v = await verifyGmail(gmailUser, pass);
      if (!v.ok) return NextResponse.json({ error: v.error || "That App Password didn't work." }, { status: 400 });
      warn = v.warn;
    }
    const status = setSending(me.slug, gmailUser, body.appPassword);
    return NextResponse.json({ ok: true, sending: status, warn });
  }

  const { phones = [], emails = [] } = body;

  const cleanPhones: string[] = [];
  for (const p of (Array.isArray(phones) ? phones : []).filter((x) => String(x).trim())) {
    const c = cleanPhone(p);
    if (c === "INVALID") return NextResponse.json({ error: `"${p}" isn't a 10-digit phone number.` }, { status: 400 });
    if (c) cleanPhones.push(c);
  }
  const cleanEmails: string[] = [];
  for (const e of (Array.isArray(emails) ? emails : []).filter((x) => String(x).trim())) {
    if (!okEmail(e)) return NextResponse.json({ error: `"${e}" isn't a valid email.` }, { status: 400 });
    cleanEmails.push(e.trim().toLowerCase());
  }

  const saved = setUserProfile(me.slug, { phones: cleanPhones, emails: cleanEmails });
  return NextResponse.json({ ok: true, profile: saved });
}
