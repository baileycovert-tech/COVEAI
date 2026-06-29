import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";
import { setOverride, getAllOverrides, removeOverride } from "../../lib/overrides";
import { searchContacts } from "../../lib/contacts";

export const dynamic = "force-dynamic";

// GET ?q=name → what COVE currently has in the index + your manually-added contacts.
export async function GET(req: NextRequest) {
  if (!currentUser()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = req.nextUrl.searchParams.get("q") || "";
  return NextResponse.json({
    ok: true,
    indexMatches: q ? searchContacts(q, 30) : [],
    added: getAllOverrides(),
  });
}

// POST { name, phone, email } adds/corrects a contact; { name, remove:true } removes it.
export async function POST(req: NextRequest) {
  if (!currentUser()) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { name, phone, email, remove } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") return NextResponse.json({ error: "A name is required." }, { status: 400 });

  if (remove) {
    removeOverride(name);
    return NextResponse.json({ ok: true, removed: name, added: getAllOverrides() });
  }
  if (!String(phone || "").trim() && !String(email || "").trim()) {
    return NextResponse.json({ error: "Add a phone number and/or an email." }, { status: 400 });
  }
  try {
    setOverride(name, phone, email);
    return NextResponse.json({ ok: true, added: getAllOverrides() });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}
