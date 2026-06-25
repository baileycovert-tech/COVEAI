import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { readSession, COOKIE, getUserBySlug } from "../../lib/auth";
import { matchInventory } from "../../lib/data";

export const dynamic = "force-dynamic";

const DATA = path.join(process.cwd(), "data");
const SEND = path.join(process.cwd(), "scripts", "send.py");

function firstTouch(channel: "text" | "email", first: string, vehicle: string, repName: string) {
  const v = vehicle && !/unknown/i.test(vehicle) ? vehicle : "the right vehicle";
  if (channel === "email") {
    return {
      subject: `Following up on ${v} — Covert`,
      body: `Hi ${first},\n\nThanks for reaching out about ${v}. This is ${repName} with Covert Ford Chevrolet in Hutto — I'd love to help you find exactly what you're after.\n\nWhat does your week look like to come take a look? I'll have a few options lined up so it's quick and easy.\n\n${repName}\nCovert Ford Chevrolet, Hutto`,
    };
  }
  return { body: `Hey ${first}, it's ${repName} with Covert in Hutto — thanks for the interest in ${v}. Want me to pull a couple of options for you? What day works to take a look? — ${repName}` };
}

function send(channel: string, recipient: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const args = channel === "email" ? [SEND, "email", recipient, subject || "", body] : [SEND, "imessage", recipient, body];
  return new Promise((resolve) => {
    execFile("python3", args, { timeout: 40000 }, (err, stdout) => {
      try { resolve(JSON.parse((stdout || "").trim().split("\n").pop() || "")); }
      catch { resolve({ ok: false, error: err ? String(err) : "no result" }); }
    });
  });
}

export async function POST(req: NextRequest) {
  const session = readSession(cookies().get(COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const user = getUserBySlug(session.slug);
  const { name, phone, email, vehicle, source, notes, firstTouchChannel } = await req.json();
  if (!name) return NextResponse.json({ error: "Customer name is required." }, { status: 400 });

  const first = String(name).trim().split(/\s+/)[0];
  const matches = matchInventory(vehicle || "");
  const matchStr = matches.length ? `${matches[0].units} ${matches[0].model} in stock (~$${Math.round(matches[0].avgMsrp / 1000)}k)` : "no exact match — dealer-trade option";
  const now = new Date().toISOString().replace(/\.\d+Z$/, "");

  // 1) Append to this rep's in-app lead feed.
  const feedPath = path.join(DATA, "lead-feed.json");
  let feed: Record<string, any[]> = {};
  try { feed = JSON.parse(fs.readFileSync(feedPath, "utf8")); } catch {}
  feed[session.slug] = [{ at: now, source: source || "Walk-in", customer: name, vehicle: vehicle || "", match: matchStr, urgent: true, manual: true }, ...(feed[session.slug] || [])].slice(0, 30);
  fs.writeFileSync(feedPath, JSON.stringify(feed, null, 2) + "\n");

  // 2) Record it.
  const recPath = path.join(DATA, "manual-leads.json");
  let recs: any[] = [];
  try { recs = JSON.parse(fs.readFileSync(recPath, "utf8")); } catch {}
  recs.unshift({ rep: session.slug, name, phone: phone || "", email: email || "", vehicle: vehicle || "", source: source || "Walk-in", notes: notes || "", at: now });
  fs.writeFileSync(recPath, JSON.stringify(recs.slice(0, 500), null, 2) + "\n");

  // 3) Auto first-touch to the CUSTOMER — only for admin (sends via Bailey's accounts).
  let firstTouchResult: any = null;
  if (firstTouchChannel && firstTouchChannel !== "none") {
    if (!user?.isAdmin) {
      firstTouchResult = { ok: false, error: "Auto-send is only enabled for the admin account right now — saved the lead; reach out from your own phone/email." };
    } else {
      const recipient = firstTouchChannel === "email" ? email : phone;
      if (!recipient) {
        firstTouchResult = { ok: false, error: `No ${firstTouchChannel === "email" ? "email" : "phone"} provided — lead saved, nothing sent.` };
      } else {
        const msg = firstTouch(firstTouchChannel, first, vehicle || "", session.name.split(" ")[0]);
        const r = await send(firstTouchChannel, recipient, (msg as any).subject || "", msg.body);
        firstTouchResult = r.ok ? { ok: true, channel: firstTouchChannel } : { ok: false, error: r.error };
        // log
        try {
          const lp = path.join(DATA, "send-log.json");
          let log: any[] = []; try { log = JSON.parse(fs.readFileSync(lp, "utf8")); } catch {}
          log.unshift({ customer: name, channel: firstTouchChannel, to: firstTouchChannel === "email" ? (email || "").replace(/^(.).*(@.*)$/, "$1***$2") : "•••" + String(phone).slice(-4), at: now, kind: "first-touch" });
          fs.writeFileSync(lp, JSON.stringify(log.slice(0, 300), null, 2) + "\n");
        } catch {}
      }
    }
  }

  return NextResponse.json({ ok: true, match: matchStr, firstTouch: firstTouchResult });
}
