import { NextRequest, NextResponse } from "next/server";

// Edge-runtime auth gate. Verifies the signed session cookie with Web Crypto
// (Node's crypto isn't available here). Unauthenticated → /login (pages) or 401 (APIs).

const COOKIE = "crm_session";
const SECRET = process.env.CRM_SESSION_SECRET || "covert-crm-dev-secret-change-me";

function b64uToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let bin = "";
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function valid(token?: string): Promise<boolean> {
  if (!token || !token.includes(".")) return false;
  const [payload, sig] = token.split(".");
  try {
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    if (bytesToB64u(mac) !== sig) return false;
    const data = JSON.parse(new TextDecoder().decode(b64uToBytes(payload)));
    return !!data.exp && data.exp > Date.now();
  } catch { return false; }
}

const PUBLIC = ["/login", "/api/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Allow static assets, the manifest, icons, and the login surfaces through.
  if (
    pathname.startsWith("/_next") || pathname.startsWith("/icon") ||
    pathname === "/apple-touch-icon.png" || pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))
  ) {
    return NextResponse.next();
  }

  const ok = await valid(req.cookies.get(COOKIE)?.value);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
