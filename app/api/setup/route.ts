import { NextRequest, NextResponse } from "next/server";
import { currentUser, getUserBySlug } from "../../lib/auth";
import { getUserProfile, setUserProfile } from "../../lib/user-profile";

export const dynamic = "force-dynamic";

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
  });
}

// Save the signed-in rep's own phone(s) + email(s).
export async function POST(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { phones = [], emails = [] } = await req.json().catch(() => ({}));

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
