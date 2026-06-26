import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "../../../lib/auth";
import { setOverride, getOverride } from "../../../lib/overrides";

export const dynamic = "force-dynamic";

// Save a manually-entered phone/email for an outreach target. This wins over the
// contacts.db enrichment and persists across the nightly rebuild (keyed by name).
export async function POST(req: NextRequest) {
  if (!currentUser()?.isAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { name, phone, email } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "A customer name is required." }, { status: 400 });
  }
  if (phone === undefined && email === undefined) {
    return NextResponse.json({ error: "Provide a phone number and/or an email." }, { status: 400 });
  }

  try {
    const ov = setOverride(name, phone, email);
    return NextResponse.json({
      ok: true,
      name: ov.name,
      phone: ov.phone,
      email: ov.email,
      hasPhone: !!ov.phone,
      hasEmail: !!ov.email,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 400 });
  }
}

// Current saved override for a name (handy for prefilling the edit form).
export async function GET(req: NextRequest) {
  if (!currentUser()?.isAdmin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const name = req.nextUrl.searchParams.get("name") || "";
  const ov = getOverride(name);
  return NextResponse.json({ ok: true, override: ov });
}
