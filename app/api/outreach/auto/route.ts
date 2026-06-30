import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { leadFeedAsCustomers, getOutreachQueue, writeData, OutreachDraft } from "../../../lib/data";
import { draftMessage } from "../../../lib/anthropic";
import { lookupContact } from "../../../lib/contacts";
import { pushToSlug } from "../../../lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Auto-draft engine. Triggered by a cron (launchd) on the lead-refresh cycle — NOT by a browser.
// For each COVE rep, it finds NEW leads that have a phone/email, drafts the first touch in THAT rep's
// voice (with inventory match), drops it in their outreach queue as "ready to send" (status: draft),
// and pushes their phone. Nothing is auto-SENT — the rep taps Send. Per-rep scoped: a draft only ever
// belongs to the rep whose lead it is.
const DATA = path.join(process.cwd(), "data");
const STATE = path.join(DATA, "auto-outreach-state.json");
const PER_REP = 8;   // drafts per rep per run — works through a backlog without one rep monopolizing
const GLOBAL = 40;   // overall safety cap on Anthropic calls per cron tick

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const cronSecret = () => {
  if (process.env.CRM_SESSION_SECRET) return process.env.CRM_SESSION_SECRET;
  try { return fs.readFileSync(path.join(DATA, ".session-secret"), "utf8").trim(); } catch { return null; }
};

function appReps(): { slug: string; name: string; textOK: boolean }[] {
  let users: any[] = [];
  try { users = JSON.parse(fs.readFileSync(path.join(DATA, "users.json"), "utf8")); } catch { return []; }
  return users
    .filter((u) => u && (u.slug === "bailey-covert" || u.feed === true))
    .map((u) => ({ slug: u.slug, name: u.name, textOK: u.slug === "bailey-covert" })); // only Bailey can auto-send texts (his Mac/number)
}

export async function POST(req: NextRequest) {
  const secret = cronSecret();
  if (!secret || req.headers.get("x-cove-cron") !== secret) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const state: Record<string, string> = (() => {
    try { return JSON.parse(fs.readFileSync(STATE, "utf8")); } catch { return {}; }
  })();
  const queue = getOutreachQueue();
  const summary: Record<string, number> = {};
  let made = 0;

  for (const rep of appReps()) {
    if (made >= GLOBAL) break;
    const leads = leadFeedAsCustomers(rep.slug);
    const fresh: { draft: OutreachDraft }[] = [];
    let repMade = 0;

    for (const c of leads) {
      if (made >= GLOBAL || repMade >= PER_REP) break;
      const key = `${rep.slug}:${norm(c.name)}`;
      if (state[key]) continue;                          // already auto-drafted this lead
      // skip if there's already an open draft for this customer under this rep
      if (queue.some((d) => (d.rep || "bailey-covert") === rep.slug && norm(d.customer) === norm(c.name) && d.status !== "sent" && d.status !== "dismissed")) {
        state[key] = new Date().toISOString();
        continue;
      }
      const hit = lookupContact(c.name, null);
      const phone = hit?.phone || "";
      const email = hit?.email || "";
      // Bailey: text if we have a number, else email. Other reps: email only (their SMS isn't reachable).
      const channel: "text" | "email" = rep.textOK && phone ? "text" : "email";
      const to = channel === "text" ? phone : email;
      if (!to) continue; // no phone/email on file yet — skip WITHOUT marking, so they draft once contact info lands

      try {
        const drafted = await draftMessage({
          customer: c,
          channel,
          intent: `First outreach to a brand-new lead. ${c.notes ? "Inventory match on file: " + c.notes + "." : ""} Open the door and ask for a time.`,
          repName: rep.name,
        });
        const entry: OutreachDraft = {
          id: `auto-${rep.slug}-${norm(c.name)}-${Date.now()}`,
          customer: c.name, slug: c.slug, channel,
          subject: drafted.subject, body: drafted.body,
          status: "draft", createdAt: new Date().toISOString(),
          rationale: `New lead via ${c.source || "CRM"}${c.notes ? " · " + c.notes : ""}`,
          generatedBy: drafted.generatedBy, rep: rep.slug, to, auto: true,
        };
        queue.unshift(entry);
        fresh.push({ draft: entry });
        state[key] = new Date().toISOString();
        made++; repMade++;
      } catch {
        // leave unmarked so it retries next run
      }
    }

    if (fresh.length) {
      summary[rep.slug] = fresh.length;
      const first = fresh[0].draft;
      const more = fresh.length > 1 ? ` +${fresh.length - 1} more` : "";
      await pushToSlug(rep.slug, {
        title: `${fresh.length} new lead${fresh.length === 1 ? "" : "s"} — draft${fresh.length === 1 ? "" : "s"} ready`,
        body: `${first.customer} (${first.channel})${more}. Tap to review & send.`,
        url: "/outreach", tag: "auto-outreach", urgent: true,
      });
    }
  }

  if (made > 0) writeData("outreach-queue.json", queue);
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + "\n");
  return NextResponse.json({ ok: true, drafted: made, byRep: summary });
}
