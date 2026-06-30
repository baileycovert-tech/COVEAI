import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../lib/auth";
import { setOverride, getAllOverrides, removeOverride } from "../../lib/overrides";
import { searchContacts, browseContacts } from "../../lib/contacts";

export const dynamic = "force-dynamic";

// The contact index is the owner's personal phone book — admin only, same as the page.
// (Was signed-in-only, which let any rep query it via the API.)
function gate() {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return null;
}

// GET ?q=name → index search; ?browse=1&offset&letter → paged A–Z browse; plus your added contacts.
export async function GET(req: NextRequest) {
  const blocked = gate();
  if (blocked) return blocked;
  const sp = req.nextUrl.searchParams;
  if (sp.get("browse")) {
    const offset = parseInt(sp.get("offset") || "0", 10) || 0;
    const letter = sp.get("letter") || "";
    return NextResponse.json({ ok: true, ...browseContacts(offset, 60, letter) });
  }
  const q = sp.get("q") || "";
  return NextResponse.json({
    ok: true,
    indexMatches: q ? searchContacts(q, 30) : [],
    added: getAllOverrides(),
  });
}

// POST { name, phone, email } adds/corrects a contact; { name, remove:true } removes it.
export async function POST(req: NextRequest) {
  const blocked = gate();
  if (blocked) return blocked;
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
