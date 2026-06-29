import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { currentUser } from "../../../lib/auth";
import { getJacket } from "../../../lib/deal-jackets";

export const dynamic = "force-dynamic";

// Stream a filled deal packet for preview/download. Owner (or admin) only.
export async function GET(req: NextRequest) {
  const me = currentUser();
  if (!me) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id") || "";
  const j = getJacket(id);
  if (!j) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (j.createdBy !== me.slug && !me.isAdmin) return NextResponse.json({ error: "Not your deal" }, { status: 403 });
  if (!fs.existsSync(j.pdfPath)) return NextResponse.json({ error: "Packet file missing" }, { status: 404 });
  const buf = fs.readFileSync(j.pdfPath);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${j.pdfName}"`,
      "Cache-Control": "no-store",
    },
  });
}
