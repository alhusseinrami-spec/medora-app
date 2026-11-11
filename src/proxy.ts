import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: no cookie means straight to sign-in. Every page and route
// still verifies the session against the database (lib/auth.ts).
// /api/cron and /api/nour have no session: they check their own secret key instead.
// /shop is the public customer shop and /privacy its privacy policy; /.well-known/assetlinks.json links the Android apps; /field.webmanifest and /field-sw.js make the field app installable; /api/push/subscribe is how a customer's phone turns notifications on or off.
const PUBLIC = ["/login", "/setup", "/api/health", "/api/cron", "/api/nour", "/shop", "/api/push/subscribe", "/privacy"];
const PUBLIC_FILES = ["/.well-known/assetlinks.json", "/field.webmanifest", "/field-sw.js", "/shop-sw.js", "/shop-push.js", "/shop-admin.js", "/shop.webmanifest", "/shop-icon-192.png", "/shop-icon-512.png"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_FILES.includes(pathname)) return NextResponse.next();
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

export const config = { matcher: ["/((?!_next/|icon.svg|favicon.ico).*)"] };
