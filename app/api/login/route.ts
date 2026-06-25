import { NextRequest, NextResponse } from "next/server";
import { verifyLogin, signSession, COOKIE } from "../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { name, password } = await req.json();
  const user = verifyLogin(String(name || ""), String(password || ""));
  if (!user) {
    return NextResponse.json({ error: "Wrong name or employee number." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, slug: user.slug, name: user.name });
  // Behind the Cloudflare tunnel the local hop is http, so trust x-forwarded-proto.
  const isHttps = req.headers.get("x-forwarded-proto") === "https" || req.nextUrl.protocol === "https:";
  res.cookies.set(COOKIE, signSession(user.slug, user.name), {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 864e2,
    secure: isHttps,
  });
  return res;
}
