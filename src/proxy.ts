import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { availableAgents } from "@/lib/agents";

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
// Derived from the registry, not spelled out: a hardcoded list here is a
// second source of truth that only ever drifts, and its failure mode is a
// public marketing page 307ing to /login in production while every local check
// passes (self-host never sets LANDING_ENABLED, so it never notices).
const AGENT_LANDING_PATHS = new Set(availableAgents().map((a) => a.landingPath));

const PUBLIC_FILES = new Set([
  "/sitemap.xml",
  "/robots.txt",
  "/setup.sh",
  // The self-host one-liner: curl -fsSL https://dispatchseo.com/install.sh | sh
  // - a login redirect here pipes HTML into sh on every install.
  "/install.sh",
  // Agent-facing site summary; crawlers and MCP clients read it logged-out.
  "/llms.txt",
  // The same docs as one plain-text file, for agents that would rather fetch
  // once than crawl. Same public-by-design reasoning as /docs itself.
  "/llms-full.txt",
  "/icon.png",
  "/apple-icon.png",
  "/opengraph-image.png",
  // The brand mark, rendered by <DispatchMark> in the landing nav/footer and
  // on every auth page - all of which are, by definition, viewed logged-out.
  // Without this the gate 307s the <img> to /login and the logo renders as a
  // broken-image placeholder for every anonymous visitor (it only looked fine
  // in-browser because the developer had a session cookie).
  "/dispatch-mark.png",
  // Sentry's tunnel (next.config.ts tunnelRoute). The browser POSTs error
  // reports here, and the errors most worth catching are the ones on /login
  // and /signup - where the visitor has no cookie by definition. Gate it and
  // every anonymous crash report 307s into the login page and is lost.
  "/monitoring",
]);

const CLOUD_COOKIE = /^sb-.+-auth-token/;

// THE ONLY PLACE A ROTATED SESSION CAN BE SAVED.
//
// Supabase rotates the refresh token every time it is used. Persisting the new
// one means writing cookies - and cookies().set() THROWS inside a Server
// Component, which is why cloud-auth's setAll swallows it. So no page render
// could ever save a refreshed session: Supabase handed back a new token, the
// browser never received it, and the next navigation replayed the spent one.
// Outside GoTrue's short reuse window that trips reuse detection and kills the
// token family, and the customer is bounced to /login having done nothing
// wrong. Active users only survived by accident, because the dashboard polls
// two Route Handlers, which CAN write cookies.
//
// The proxy is the one hop in a GET's path that can legally set cookies, so
// rotation lands here. Two deliberate choices:
//
//   getSession(), not getUser(). getUser() calls the auth server on EVERY
//   request; getSession() reads the cookie and only goes to the network when
//   the token actually needs refreshing. This is not an auth decision - every
//   protected page still re-validates with currentUser() and redirects itself,
//   and the proxy has only ever done presence-based routing - so the cheaper
//   call is the correct one here. Security does not move.
//
//   Fail OPEN on anything unexpected. This runs on every gated request; a throw
//   here would 500 the entire product, which is far worse than any bug it
//   fixes. On error we return null and the caller falls through to exactly the
//   behaviour that shipped before this existed.
async function persistRotatedSession(req: NextRequest): Promise<NextResponse | null> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  try {
    const res = NextResponse.next({ request: req });
    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) res.cookies.set(name, value, options);
        },
      },
    });
    const { data, error } = await supabase.auth.getSession();
    if (!error && data.session) return res; // rotation (if any) is now on `res`
    if (error) return null; // network/transient - let the page decide, as before
    // No session behind a present cookie: it is spent or revoked, and proven so.
    // Clear it rather than letting the customer bounce off /login forever with a
    // cookie that reads as "signed in" to the gate and "expired" to every page -
    // signOut() cannot do this, it returns early on exactly this error class.
    const dead = NextResponse.redirect(new URL("/login", req.url));
    for (const c of req.cookies.getAll()) {
      if (CLOUD_COOKIE.test(c.name)) dead.cookies.delete(c.name);
    }
    return dead;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api/") ||
    // RFC 8414 / RFC 9728 discovery. MCP clients (claude.ai's custom
    // connectors, for one) probe /.well-known/oauth-protected-resource and
    // /.well-known/oauth-authorization-server before their first real call.
    // A 404 there is the correct "no OAuth on this server, use what you were
    // given" answer; a 307 to /login reads as "there IS a sign-in service",
    // and the client then tries to register with it and fails (seen live
    // 2026-08-20: "Couldn't register with DispatchSEO's sign-in service").
    // Nothing is served under this prefix, so letting it through is a 404.
    pathname.startsWith("/.well-known/") ||
    pathname.startsWith("/login") ||
    // Cloud account creation - only meaningful in CLOUD_MODE (the page
    // itself bounces self-host visitors to /login).
    pathname === "/signup" ||
    // Password recovery - both legs serve logged-out visitors by definition
    // (a locked-out user has no session), so they must clear the gate the same
    // way /login and /signup do. The pages themselves bounce self-host visitors
    // to /login and re-check the recovery session server-side.
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    // OAuth return leg for cloud Google sign-in: the visitor has no session
    // yet by definition when they land here.
    pathname === "/auth/callback" ||
    // First-boot wizard: must be reachable before any password exists. Only
    // the exact path - claiming redirects into /onboarding, which is gated.
    pathname === "/setup" ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/") ||
    // Public docs (src/app/docs) - install instructions have to be readable
    // before anyone has an install to log into.
    pathname === "/docs" ||
    pathname.startsWith("/docs/") ||
    // Public free tools (src/app/free-tools) - the funnel's whole point is
    // that a logged-out visitor can use them. LANDING_ENABLED-gated like the
    // marketing pages below, and for the same reason: on a self-hosted
    // install this is OUR funnel on THEIR domain, and every CTA in it
    // ("Start for free" -> /signup) bounces to /login there anyway.
    ((pathname === "/free-tools" || pathname.startsWith("/free-tools/")) &&
      process.env.LANDING_ENABLED === "true") ||
    // Landing-page slideshow assets - the marketing page must load them
    // logged-out (they are product screenshots, nothing sensitive).
    pathname.startsWith("/screenshots/") ||
    // Privacy policy must be public: Google's OAuth consent screen links to
    // it and the verification reviewers open it logged-out.
    pathname === "/privacy" ||
    // Terms of service: linked from checkout + billing, read logged-out.
    pathname === "/terms" ||
    // The subprocessor list and the Art. 28 data processing agreement. Both
    // are cited BY the privacy policy and the terms, so a logged-out reader
    // following those links has to be able to land on them - and procurement
    // reviewers reading them are, by definition, not customers yet.
    pathname === "/subprocessors" ||
    pathname === "/dpa" ||
    // Google-data usage page: written for the OAuth branding reviewers, who
    // open it logged-out (linked from the homepage footer + FAQ).
    pathname === "/google-data" ||
    // Product release notes. Public by design: it describes DispatchSEO
    // itself, never a tenant's data, it opens in its own tab from the
    // dashboard banner, and a linkable changelog is worth having.
    pathname === "/changelog" ||
    // Plain app-description page: set as the OAuth consent screen's
    // "Application home page", so Google's branding checker opens it
    // logged-out.
    pathname === "/about" ||
    PUBLIC_FILES.has(pathname) ||
    // Dev-only setup-path design review (fixtures, no database). Never in a
    // production build: there it stays behind login AND the page 404s.
    (process.env.NODE_ENV !== "production" &&
      (pathname === "/onboarding/preview" || pathname === "/qualify/preview")) ||
    // The marketing landing page and its per-agent hub pages - cloud
    // deployment only. Self-hosted installs never set LANDING_ENABLED, so
    // theirs stay gated (the pages themselves also redirect to /dashboard as
    // defense in depth).
    ((pathname === "/" || AGENT_LANDING_PATHS.has(pathname)) &&
      process.env.LANDING_ENABLED === "true")
  ) {
    return NextResponse.next();
  }
  const cookie = req.cookies.get("dash_auth")?.value;
  // CLOUD_MODE sessions are Supabase Auth cookies (sb-<ref>-auth-token,
  // possibly chunked with .0/.1 suffixes), not dash_auth. Presence-based
  // routing only, same as the password cookie - pages re-validate the
  // session server-side via the auth gate.
  const hasCloudSession =
    process.env.CLOUD_MODE === "true" &&
    req.cookies.getAll().some((c) => CLOUD_COOKIE.test(c.name));
  if (!cookie && !hasCloudSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (hasCloudSession) {
    const rotated = await persistRotatedSession(req);
    if (rotated) return rotated;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
