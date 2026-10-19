import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no cookie means straight to sign-in. Every page and route
// still verifies the session against the database (lib/auth.ts).
// /api/cron and /api/nour have no session: they check their own secret key instead.
const PUBLIC = ["/login", "/setup", "/api/health", "/api/cron", "/api/nour"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (!req.cookies.get("medora_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Static app files stay public: the service worker, the Home Screen manifest and icons are fetched without a session.
export const config = { matcher: ["/((?!_next/|icon.svg|icon-192.png|icon-512.png|apple-touch-icon.png|favicon.ico|sw.js|manifest.webmanifest).*)"] };
