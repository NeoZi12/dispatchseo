import { NextResponse, type NextRequest } from "next/server";

// Next 16 proxy (the middleware.ts successor). Gates the dashboard behind the
// password cookie. /api/* is excluded - the MCP route and crons carry their
// own bearer auth. The cookie check here is presence-based routing only; the
// HMAC verification happens in the page (node runtime), so a forged cookie
// still renders nothing sensitive - it just reaches the server component,
// which re-validates.

// The public surface - everything else is the password-gated dashboard.
// /blog + sitemap must stay reachable or Google can't crawl the content the
// whole pipeline exists to publish; /setup.sh is the onboarding script the
// dashboard tells new users to curl.
const PUBLIC_FILES = new Set([
  "/sitemap.xml",
  "/robots.txt",
  "/setup.sh",
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image.png",
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/login") ||
    // First-boot wizard: must be reachable before any password exists. Only
    // the exact path - /setup/keys stays behind the cookie-presence gate.
    pathname === "/setup" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    // Privacy policy must be public: Google's OAuth consent screen links to
    // it and the verification reviewers open it logged-out.
    pathname === "/privacy" ||
    PUBLIC_FILES.has(pathname) ||
    // The marketing landing page - cloud deployment only. Self-hosted installs
    // never set LANDING_ENABLED, so their / stays gated (the page itself also
    // redirects to /dashboard as defense in depth).
    (pathname === "/" && process.env.LANDING_ENABLED === "true")
  ) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get("dash_auth")?.value;
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
