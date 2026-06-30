import type { Customer } from "./data";

export type SalesStage = "new" | "qualifying" | "working" | "objection" | "closing" | "post-sale";

export type DraftInput = {
  customer: Customer;
  channel: "text" | "email";
  intent: string; // what the rep wants to accomplish
  repName?: string; // the salesperson the message is FROM (defaults to Bailey Covert)
  stage?: SalesStage;     // where this lead is in the sale (auto-classified if omitted)
  lastInbound?: string;   // the customer's most recent message, so the draft responds to it
};

const DEFAULT_REP = "Bailey Covert";

// Voice is per-rep so every salesperson's auto-drafts sign in THEIR name, never someone else's.
function voiceFor(repName: string, repFirst: string): string {
  return `You are drafting a message AS ${repName}, a car salesperson at Covert Hutto (Covert Ford Chevrolet, Hutto TX).
${repFirst}'s voice: warm, direct, low-pressure, first-name basis, Texan-friendly but professional. They build long-term
relationships, never sound like a spam blast, and always give the customer a concrete easy next step (a time to come
in, a question to answer, a vehicle to look at). Sign texts "— ${repFirst}" and emails "${repName}, Covert Hutto".
Keep texts under 320 characters. Keep emails tight: 2-4 short paragraphs, a clear subject line.

HARD RULES (never break, even if the goal says otherwise):
- NEVER state a trade/appraisal/KBB figure, price, payment, or gross. Bring them in to confirm numbers in person.
  (No figures in appointment confirmations either.)
- Always end with ONE concrete next step / appointment ask. Reviving a stalled thread → ask ONE open question.
- Post-sale: congratulate and build the relationship — NO sales pitch. If they raise ANY problem, say you'll get a
  manager on it and do NOT ask for a review. Only ask for a review after the customer has signaled they're happy.
- First name only. No emoji, no Carfax, no photos. Never invent a stock #, VIN, price, name, or date.`;
}

// Sales-stage playbook (adapted from SalesGPT's stage model → car-sales, COVE guardrails).
function stageGuidance(stage: SalesStage): string {
  switch (stage) {
    case "new": return "NEW LEAD (first touch) — warm intro, reference exactly what they inquired on, one easy ask for a time. Don't overload.";
    case "qualifying": return "QUALIFYING — they engaged but you don't know their needs yet. Ask ONE question (timeline, must-haves, or trade) and steer toward an in-person visit.";
    case "working": return "WORKING — answer their question simply, reinforce the vehicle fits, move toward a specific time to come in. No figures over text.";
    case "objection": return "OBJECTION HANDLING — acknowledge the concern sincerely; do NOT negotiate numbers over text. Invite them in to go over it together so you can earn it, then ask for a time.";
    case "closing": return "CLOSING — they're ready. Lock a specific day/time, say you'll have everything prepped so it's quick. Confirm; don't re-sell.";
    case "post-sale": return "POST-SALE — congratulate and build the relationship, NO pitch. Any problem → loop in a manager; only ask for a review once they're clearly happy.";
  }
}

// Infer the stage from the customer record + their last message, so the draft fits the moment.
function classifyStage(c: Customer, lastInbound?: string): SalesStage {
  if (/sold|deliver|closed|congrat/i.test(c.stage || c.status || "")) return "post-sale";
  const t = (lastInbound || "").toLowerCase();
  if (!t.trim()) return "new"; // no reply yet → first touch
  if (/too (high|much)|expensive|payment|monthly|price|\brate\b|apr|come down|best (you can|price)|knock|think about|need to (talk|check|sleep)|not sure|other dealer|beat (it|that|the)|over my|out of (my )?budget/.test(t)) return "objection";
  if (/come in|stop by|what time|tomorrow|today|tonight|this (afternoon|evening|week)|appointment|test ?drive|i'?ll take|let'?s do|paperwork|finalize|deposit|when can i (pick|get|come)/.test(t)) return "closing";
  if (/\?|available|in stock|color|\btrim\b|miles|mileage|year|how much|details|interested|still (have|there|available)/.test(t)) return "working";
  return "qualifying";
}

// Tailor the opener to where the lead came from (trade vs shopping vs finance).
function sourceGuidance(source: string): string {
  const s = (source || "").toLowerCase();
  if (/kbb|ico|trade|payoff|loan matur/.test(s))
    return "TRADE lead — open about their trade-in: thank them, offer to confirm the appraisal in person, ask when they can come in. NEVER quote a figure.";
  if (/capital one|chase|700credit|credit yes|gm financ|credit app|finance/.test(s))
    return "FINANCE lead — keep it low-key: offer to help them find the right vehicle and get pre-approved, ask when they can stop by. No figures.";
  return "SHOPPING lead — open about the specific vehicle they inquired on: confirm we have it / something close, ask when they can take a look.";
}

function buildPrompt(i: DraftInput): string {
  const c = i.customer;
  const repName = i.repName || DEFAULT_REP;
  const repFirst = repName.split(/\s+/)[0];
  const stage = i.stage || classifyStage(c, i.lastInbound);
  return `${voiceFor(repName, repFirst)}

CUSTOMER CONTEXT (only use what's relevant; never invent facts not listed):
- Name: ${c.name}
- Vehicle interest: ${c.vehicle_interest || "unknown"}
- Trade: ${c.trade || "none noted"}
- Pipeline stage: ${c.stage || "lead"}
- Last touch: ${c.last_touch || "unknown"}
- Next step on file: ${c.next_step || "unknown"}
- Rapport notes: ${c.personal || "none"}
- Summary: ${c.notes || "none"}
- Lead source: ${c.source || "unknown"} → ${sourceGuidance(c.source || "")}
- SALES STAGE: ${stage} → ${stageGuidance(stage)}${i.lastInbound ? `\n- Their last message to us: "${i.lastInbound.replace(/\s+/g, " ").slice(0, 240)}" — respond to THIS directly.` : ""}

GOAL OF THIS MESSAGE: ${i.intent || c.next_step || "re-engage and move the deal forward"}
CHANNEL: ${i.channel}

Write ONE ${i.channel} message. ${i.channel === "email"
    ? 'Return it as "Subject: <line>" on the first line, then a blank line, then the body.'
    : "Return just the text message body, no preamble."}
Do not include any commentary — only the message itself.`;
}

// Template fallback when no API key is configured.
function templateDraft(i: DraftInput): { subject?: string; body: string } {
  const c = i.customer;
  const first = c.name.split(/\s+/)[0];
  const repName = i.repName || DEFAULT_REP;
  const repFirst = repName.split(/\s+/)[0];
  const rawVeh = c.vehicle_interest || "";
  const veh = !rawVeh || /unknown/i.test(rawVeh) ? "the right vehicle" : rawVeh;
  if (i.channel === "email") {
    return {
      subject: `Following up on ${veh} — Covert`,
      body: `Hi ${first},\n\nWanted to check back in on ${veh}. ${c.next_step || "Happy to line up a time that works for you and put numbers together."}\n\nWhat does your week look like to swing by? I'll have everything ready so it's quick.\n\n${repName}\nCovert Ford Chevrolet, Hutto`,
    };
  }
  return {
    body: `Hey ${first}, it's ${repFirst} at Covert. Circling back on ${veh} — ${c.next_step || "want me to pull a couple options for you?"} What day works to take a look? — ${repFirst}`,
  };
}

export async function draftMessage(i: DraftInput): Promise<{ subject?: string; body: string; generatedBy: "ai" | "template" }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ...templateDraft(i), generatedBy: "template" };
  }
  try {
    // Lazy import so the app runs without the SDK installed / key set.
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: key });
    const model = process.env.OUTREACH_MODEL || "claude-opus-4-8";
    const msg = await client.messages.create({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: buildPrompt(i) }],
    });
    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("").trim();
    if (i.channel === "email") {
      const m = text.match(/^subject:\s*(.+)$/im);
      const subject = m ? m[1].trim() : `Following up — Covert`;
      const body = text.replace(/^subject:\s*.+$/im, "").trim();
      return { subject, body, generatedBy: "ai" };
    }
    return { body: text, generatedBy: "ai" };
  } catch (e) {
    // Any API failure → safe template fallback so the queue still works.
    return { ...templateDraft(i), generatedBy: "template" };
  }
}
