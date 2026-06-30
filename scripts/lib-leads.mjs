/**
 * lib-leads.mjs — ONE source of truth for turning a raw inbound message (text OR email
 * OR a DMS/VinSolutions row) into a normalized lead. Used by imessage-ingest, gmail-ingest,
 * and vinsolutions-ingest so every channel parses Bailey's lead formats identically — that's
 * how we avoid "this format only works over text but not email" misses.
 *
 * Pure functions only — no I/O, no side effects, safe to import anywhere.
 */
export const phone10 = (s) => (String(s || "").match(/\d/g) || []).join("").slice(-10);
export const kebab = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const titleCase = (s) => (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// ---------- classifier vocabulary ----------
export const VEHICLE = /\b(f-?150|f-?250|f-?350|super ?duty|silverado|sierra|tahoe|suburban|yukon|bronco|ranger|maverick|expedition|explorer|escape|equinox|traverse|colorado|corvette|camaro|mustang|wrangler|gladiator|jeep|ram|tundra|tacoma|4runner|truck|suv|sedan|car|vehicle|trade|king ranch|lariat|denali|raptor|z71|at4)\b/i;
export const BUY = /\b(price|pricing|how much|payment|otd|out the door|finance|financing|interest rate|apr|available|in stock|do you have|still (there|available)|test drive|come (in|by|look)|see it|when can i|looking (for|to)|want to (buy|see|look)|interested in|thinking about|in the market|shopping for|trade ?in|quote|monthly)\b/i;
export const SPAM = /(quince|reserve your|unsubscribe|opt-back|stop to opt|congratulations|you (have )?won|gift card|claim your|bit\.ly|tinyurl|snapchat\.com|sauna|perspire|verification code|do not share|did not request|confirmation #|opt-back into)/i;
// iMessage tapback reactions ("Liked …", "Loved …") are not real messages.
export const TAPBACK = /^(Liked|Loved|Laughed at|Emphasized|Disliked|Questioned|Reacted)\b/i;
// Only the vaguest words count as "generic" — a bare "car"/"vehicle" with no buy intent is noise.
export const GENERIC_VEH = /^(car|cars|sedan|sedans|vehicle|vehicles)$/i;
// Bailey's own numbers — a self-text / outreach echo is never an inbound lead.
export const SELF_NUMBERS = new Set(["5127779404"]);
// Bailey's own self-intercept SUMMARIES (not a single lead) — skip these.
export const isBrief = (t) => /(AM brief|morning brief|dead.?lead matchmaker|reactivations queued|JUNE MTD|Pace:\s*\d|Gap to \d)/i.test(t);
export const isInternalNote = (t) => /\b(self[- ]?test|automated test|send path works)\b/i.test(t);

// Strip iMessage binary attribute blobs (NSKeyedArchiver/bplist) + UI artifacts to get clean text.
// (Harmless on plain email text — the markers just won't be present.)
export function cleanText(s) {
  let t = (s || "").replace(/\\r/g, "\n").replace(/\\n/g, "\n");
  const cut = t.search(/NSDictionary|NSKeyedArchiver|bplist00|__kIM|\[Attachments:|\[URL:/);
  if (cut > 0) t = t.slice(0, cut);
  t = t.replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ");          // drop non-printable runs
  t = t.replace(/\s+iI\s*[a-z]?\s*$/i, "").replace(/\biI\b/g, " "); // the "iI" message-part marker
  return t.replace(/[ \t]{2,}/g, " ").trim();
}

// Parse the lead-notification formats Bailey gets from 700credit / Carfax / AutoTrader / CarGurus /
// Capital One — they arrive the SAME way over text and over email:
//   A) "NEW LEAD <Name> <source> | <vehicle> | Stock <code>"
//   B) "Customer: <Name> … P: <phone> … Y: <vehicle>"
export function parseLeadAlert(t) {
  // Format A — NEW LEAD
  const nl = t.match(/NEW LEAD\s+([A-Z][a-zA-Z'’.-]+(?: [A-Z][a-zA-Z'’.-]+){1,2})/);
  if (nl) {
    const name = nl[1].replace(/\s+(Walk|Capital|Carfax|Referral|Phone|Status|Stock).*$/i, "").trim();
    const veh = (t.match(/\|\s*(?:Vehicle:\s*)?([^|]+?)\s*\|/) || [])[1];
    const stock = (t.match(/Stock:?\s*([A-Z0-9]{4,8})\b/i) || [])[1];
    const source = (t.match(/(capital one|carfax|autotrader|cargurus|truecar|walk[- ]?in|referral|700credit)/i) || [])[1] || "iMessage";
    return { name: titleCase(name), phone: null, vehicle: veh && /none specified|inquiry/i.test(veh) ? "" : (veh || "").trim(), stock, source: titleCase(source) };
  }
  // Format B — Customer:/P:/Y:
  if (!/(700credit|text response received|^customer:)/im.test(t) && !/\bP:\s*\(?\d/.test(t)) return null;
  const name = (t.match(/customer:\s*([^\n\r]+)/i) || t.match(/^\s*([A-Z][a-z]+ [A-Z][a-z]+)/m) || [])[1];
  const phone = (t.match(/P:\s*([()\d .-]{7,})/i) || [])[1];
  const veh = (t.match(/Y:\s*([^\n\r]+)/i) || [])[1];
  const stock = (t.match(/\(([A-Z0-9]{4,8})\)/) || [])[1];
  const source = (t.match(/(700credit\.?com|carfax|autotrader|cargurus|truecar|capital one)/i) || [])[1] || "iMessage";
  if (!name && !phone) return null;
  return { name: name && titleCase(name.trim()), phone: phone && phone10(phone), vehicle: veh && veh.trim(), stock, source: titleCase(source) };
}

// Parse a FREEFORM referral text (e.g. from Bailey's dad): "call John Smith 512-555-1234, wants a
// Tahoe". Pulls out the CUSTOMER's name / phone / vehicle from natural phrasing so a Tier-1 referrer's
// text becomes a real lead, not a follow-up to the referrer. Heuristic but conservative.
export function parseReferralLead(raw) {
  const t = cleanText(raw);
  const pm = t.match(/(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/); // first 10-digit phone
  const phone = pm ? phone10(pm[1]) : null;
  // name after a cue word ("name is / for / call / text / customer / talk to …"), else first "First Last"
  const cue = t.match(/\b(?:name'?s?|named|customer|client|for|it'?s|this is|talk to|call|text|reach(?: out)?(?: to)?|send(?: it to)?)\s+([A-Z][a-zA-Z'’.-]+(?:\s+[A-Z][a-zA-Z'’.-]+)?)/);
  let name = cue ? cue[1] : (t.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/) || [])[1];
  // don't let a vehicle word masquerade as a name
  if (name && VEHICLE.test(name)) name = null;
  const veh = (t.match(VEHICLE) || [])[0] || "";
  return { name: name ? titleCase(name.trim()) : null, phone, vehicle: veh };
}
