import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { outreachTargetsFor } from "../../lib/data";
import { lookupContact } from "../../lib/contacts";
import { currentUser } from "../../lib/auth";
import { getSending } from "../../lib/user-sending";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SEND_SCRIPT = path.join(process.cwd(), "scripts", "send.py");

function send(channel: string, recipient: string, subject: string, body: string, env: NodeJS.ProcessEnv): Promise<{ ok: boolean; error?: string }> {
  const args = channel === "email" ? [SEND_SCRIPT, "email", recipient, subject, body] : [SEND_SCRIPT, "imessage", recipient, body];
  return new Promise((resolve) => {
    execFile("python3", args, { timeout: 40000, env }, (err, stdout) => {
      const line = (stdout || "").trim().split("\n").pop() || "";
      try { resolve(JSON.parse(line)); } catch { resolve({ ok: false, error: err ? String(err) : "no result" }); }
    });
  });
}

// Fill {first}/{name}/{vehicle} per recipient.
const fill = (t: string, c: any) => (t || "")
  .replace(/\{first\}/gi, (c.name || "").split(/\s+/)[0] || "there")
  .replace(/\{name\}/gi, c.name || "")
  .replace(/\{vehicle\}/gi, c.vehicle_interest || "your vehicle");

export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 403 });
  const { channel = "email", slugs = [], subject = "", template = "" } = await req.json().catch(() => ({}));

  if (!Array.isArray(slugs) || slugs.length === 0) return NextResponse.json({ error: "Pick at least one customer." }, { status: 400 });
  if (slugs.length > 200) return NextResponse.json({ error: "Max 200 per blast." }, { status: 400 });
  if (!String(template).trim()) return NextResponse.json({ error: "Write the message." }, { status: 400 });

  const targets = outreachTargetsFor(me);   // a rep can only blast their own audience, never the owner's
  const chosen = new Set(slugs);
  const recips = targets.filter((c) => chosen.has(c.slug));

  // Email goes from the signed-in rep's own Gmail if linked, else the shop mailer.
  const cred = channel === "email" ? getSending(me.slug) : null;
  const env: NodeJS.ProcessEnv = cred ? { ...process.env, COVE_SMTP_USER: cred.gmailUser, COVE_SMTP_PASS: cred.appPassword, COVE_SMTP_NAME: me.name } : process.env;

  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const c of recips) {
    let to = channel === "email" ? c.email : c.phone;
    if (!to) { const hit = lookupContact(c.name, c.phone); to = channel === "email" ? hit?.email : hit?.phone; }
    if (!to) { results.push({ name: c.name, ok: false, error: `no ${channel === "email" ? "email" : "phone"} on file` }); continue; }
    const r = await send(channel, to, fill(subject, c), fill(template, c), env);
    results.push({ name: c.name, ok: !!r.ok, error: r.error });
  }

  const sent = results.filter((r) => r.ok).length;
  // audit log
  try {
    const logPath = path.join(process.cwd(), "data", "blast-log.json");
    let existing: any[] = []; try { existing = JSON.parse(fs.readFileSync(logPath, "utf8")); } catch {}
    existing.unshift({ at: new Date().toISOString(), by: me.name, channel, attempted: recips.length, sent, subject });
    fs.writeFileSync(logPath, JSON.stringify(existing.slice(0, 100), null, 2) + "\n");
  } catch {}

  return NextResponse.json({ ok: true, sent, failed: results.length - sent, results });
}
