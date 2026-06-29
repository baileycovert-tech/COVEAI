import type { Customer } from "./data";

export type DraftInput = {
  customer: Customer;
  channel: "text" | "email";
  intent: string; // what Bailey wants to accomplish
};

const VOICE = `You are drafting a message AS Bailey Covert, a car salesperson at Covert Hutto (Covert Ford Chevrolet, Hutto TX).
Bailey's voice: warm, direct, low-pressure, first-name basis, Texan-friendly but professional. He builds long-term
relationships, never sounds like a spam blast, and always gives the customer a concrete easy next step (a time to come
in, a question to answer, a vehicle to look at). He signs texts "— Bailey" and emails "Bailey Covert, Covert Hutto".
Keep texts under 320 characters. Keep emails tight: 2-4 short paragraphs, a clear subject line.

HARD RULES (never break, even if the goal says otherwise):
- NEVER state a trade/appraisal/KBB figure, price, payment, or gross. Bring them in to confirm numbers in person.
  (No figures in appointment confirmations either.)
- Always end with ONE concrete next step / appointment ask. Reviving a stalled thread → ask ONE open question.
- Post-sale: congratulate and build the relationship — NO sales pitch. If they raise ANY problem, say you'll get a
  manager on it and do NOT ask for a review. Only ask for a review after the customer has signaled they're happy.
- First name only. No emoji, no Carfax, no photos. Never invent a stock #, VIN, price, name, or date.`;

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
  return `${VOICE}

CUSTOMER CONTEXT (only use what's relevant; never invent facts not listed):
- Name: ${c.name}
- Vehicle interest: ${c.vehicle_interest || "unknown"}
- Trade: ${c.trade || "none noted"}
- Stage: ${c.stage || "lead"}
- Last touch: ${c.last_touch || "unknown"}
- Next step on file: ${c.next_step || "unknown"}
- Rapport notes: ${c.personal || "none"}
- Summary: ${c.notes || "none"}
- Lead source: ${c.source || "unknown"} → ${sourceGuidance(c.source || "")}

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
  const rawVeh = c.vehicle_interest || "";
  const veh = !rawVeh || /unknown/i.test(rawVeh) ? "the right vehicle" : rawVeh;
  if (i.channel === "email") {
    return {
      subject: `Following up on ${veh} — Covert`,
      body: `Hi ${first},\n\nWanted to check back in on ${veh}. ${c.next_step || "Happy to line up a time that works for you and put numbers together."}\n\nWhat does your week look like to swing by? I'll have everything ready so it's quick.\n\nBailey Covert\nCovert Ford Chevrolet, Hutto`,
    };
  }
  return {
    body: `Hey ${first}, it's Bailey at Covert. Circling back on ${veh} — ${c.next_step || "want me to pull a couple options for you?"} What day works to take a look? — Bailey`,
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
