import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { getOutreachQueue, getOutreachTargets, writeData } from "../../../lib/data";
import { lookupContact } from "../../../lib/contacts";
import { getOverride } from "../../../lib/overrides";

export const dynamic = "force-dynamic";

const SEND_SCRIPT = path.join(process.cwd(), "scripts", "send.py");

function runSend(channel: string, recipient: string, subject: string, body: string): Promise<{ ok: boolean; error?: string; to?: string }> {
  const args = channel === "email"
    ? [SEND_SCRIPT, "email", recipient, subject || "", body]
    : [SEND_SCRIPT, "imessage", recipient, body];
  return new Promise((resolve) => {
    execFile("python3", args, { timeout: 40000 }, (err, stdout) => {
      const line = (stdout || "").trim().split("\n").pop() || "";
      try {
        const parsed = JSON.parse(line);
        resolve(parsed);
      } catch {
        resolve({ ok: false, error: err ? String(err) : "Send bridge returned no result" });
      }
    });
  });
}

const mask = (s: string) =>
  s.includes("@")
    ? s.replace(/^(.).*(@.*)$/, "$1***$2")
    : s.replace(/.(?=.{4})/g, "•");

export async function POST(req: NextRequest) {
  const { id } = await req.json();
  const queue = getOutreachQueue();
  const draft = queue.find((d) => d.id === id);
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  // Guardrail: only approved drafts may be sent. Forces the review step first.
  if (draft.status !== "approved") {
    return NextResponse.json({ error: "Approve the draft before sending." }, { status: 400 });
  }

  // getOutreachTargets already enriches phone/email from the 35k contacts index.
  const customer = getOutreachTargets().find((c) => c.slug === draft.slug);
  let recipient = draft.channel === "email" ? customer?.email : customer?.phone;
  // Last-ditch: a manual override Bailey typed, then the contacts index
  // (covers a draft made before enrichment).
  if (!recipient) {
    const ov = getOverride(customer?.name || draft.customer);
    recipient = draft.channel === "email" ? ov?.email || undefined : ov?.phone || undefined;
  }
  if (!recipient) {
    const hit = lookupContact(customer?.name || draft.customer, customer?.phone);
    recipient = draft.channel === "email" ? hit?.email : hit?.phone;
  }
  if (!recipient) {
    return NextResponse.json(
      { error: `No ${draft.channel === "email" ? "email address" : "phone number"} found for ${draft.customer} — not in the customer record or your contacts. Add it first.` },
      { status: 400 }
    );
  }

  const result = await runSend(draft.channel, recipient, draft.subject || "", draft.body);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || "Send failed" }, { status: 502 });
  }

  // Mark sent + append an audit log entry.
  const idx = queue.findIndex((d) => d.id === id);
  (queue[idx] as any).status = "sent";
  (queue[idx] as any).sentAt = new Date().toISOString();
  (queue[idx] as any).sentTo = mask(recipient);
  writeData("outreach-queue.json", queue);

  // Append an audit-log entry for every real send.
  try {
    const logPath = path.join(process.cwd(), "data", "send-log.json");
    let existing: any[] = [];
    try { existing = JSON.parse(fs.readFileSync(logPath, "utf8")); } catch {}
    existing.unshift({
      id, customer: draft.customer, channel: draft.channel,
      to: mask(recipient), at: new Date().toISOString(),
    });
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2) + "\n");
  } catch {}

  return NextResponse.json({ ok: true, to: mask(recipient), channel: draft.channel });
}
