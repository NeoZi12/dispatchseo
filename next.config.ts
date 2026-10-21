import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Docker builds trace a minimal server into .next/standalone (~10x smaller
  // image); Vercel ignores standalone, but gating on DOCKER_BUILD keeps local
  // `pnpm build` output identical to what `pnpm start` expects.
  output: process.env.DOCKER_BUILD === "1" ? "standalone" : undefined,
  // The landing's feature screenshots ask next/image for quality 90. Next 16
  // only serves qualities that are declared here (default [75]) and flags any
  // other request as a dev "issue" - declare both rather than downgrade the
  // screenshots, which are the product's one visual proof on that page.
  images: { qualities: [75, 90] },
  // The dashboard cookie lives 30 days and SameSite=Lax does not stop the
  // page being framed - without these an attacker can iframe the logged-in
  // dashboard and clickjack Approve/Merge/Delete buttons.
  // Agent-facing markdown mirror: /docs/<slug>.md serves the raw MDX the page
  // renders from. The ".md" suffix is the convention LLM tooling probes for,
  // but a folder named "[slug].md" is not a legal App Router segment - hence a
  // rewrite onto a plain API route. The slug pattern matches getDoc's own
  // validation, so a crafted path can never reach the filesystem read.
  async rewrites() {
    return [{ source: "/docs/:slug([a-z0-9-]+).md", destination: "/api/docs-md/:slug" }];
  },
  // /discord is the one place the Discord invite code lives. Every surface that
  // points at the community - the landing hero, the footer, the README badge
  // and its three prose links - points HERE, so regenerating the invite is a
  // one-line edit in this file instead of a hunt through five hardcoded copies
  // and a redeploy of the README. Same pattern Postiz (discord.postiz.com) and
  // Immich (discord.immich.app) use, on a path rather than a subdomain because
  // we already own the app and a path costs no DNS.
  //
  // permanent: false is load-bearing. A 308 is cached by the browser forever,
  // so the day the invite code changes, everyone who ever clicked the old one
  // keeps being sent to a dead invite - which is exactly the failure this
  // indirection exists to prevent. 307 keeps the redirect ours to change.
  // (Postiz ships a 301 here; Immich ships a 307. Immich is right.)
  //
  // It also has to be a config-level redirect rather than a route: unknown
  // paths hit the dashboard auth gate and bounce to /login, and next.config
  // redirects resolve ahead of that.
  async redirects() {
    return [
      { source: "/discord", destination: "https://discord.gg/D7Eq3hKtKs", permanent: false },
      // 2026-10-21 blog prune: near-duplicate posts folded into the one page per
      // intent that survives (14 "<tool> alternative" pages into the two kept,
      // two automation listicles into one). permanent: true is right here -
      // the replacement is the page we want ranked, and the old URL must never
      // come back. Posts with no replacement are 410s in src/proxy.ts.
      { source: "/blog/se-ranking-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/wincher-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/ubersuggest-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/long-tail-pro-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/accuranker-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/serpstat-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/answerthepublic-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/majestic-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/mangools-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/moz-alternative", destination: "/blog/ahrefs-alternative", permanent: true },
      { source: "/blog/marketmuse-alternative", destination: "/blog/surfer-seo-alternative", permanent: true },
      { source: "/blog/frase-alternative", destination: "/blog/surfer-seo-alternative", permanent: true },
      { source: "/blog/outrank-alternative", destination: "/blog/surfer-seo-alternative", permanent: true },
      { source: "/blog/clearscope-alternative", destination: "/blog/surfer-seo-alternative", permanent: true },
      { source: "/blog/seo-automation-software-free", destination: "/blog/best-seo-automation-tools", permanent: true },
      { source: "/blog/best-seo-automation-software", destination: "/blog/best-seo-automation-tools", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // HSTS. The dashboard cookie is a 30-day bearer credential, so a
          // single plain-HTTP navigation (typing the domain, an old bookmark,
          // a link) is enough to hand it to anyone on the network. Browsers
          // IGNORE this header when it arrives over http://, which is what
          // makes it safe to send unconditionally - a self-hosted install
          // reached at http://<lan-ip> is unaffected, while every HTTPS
          // deployment gets pinned. No preload directive: preload is a
          // one-way door for a domain, and that is the operator's call.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Nothing here uses the camera, microphone, geolocation or payment
          // APIs. Denying them outright means an injected script or a future
          // embed cannot quietly start asking for them.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

// Sentry is wrapped ONLY when a DSN is configured. Left on unconditionally the
// plugin still rewrites the client bundle and warns about the missing auth
// token on every self-hosted `docker compose up` build - noise about a service
// that install has not signed up for.
//
// This skips the PLUGIN, not the SDK: instrumentation-client.ts imports
// @sentry/nextjs statically, so ~65KB gzipped (measured) rides along in every
// build, DSN or not - it simply never initialises and never sends. Making that
// import lazy would drop the weight for self-hosters but would also miss the
// errors thrown before the chunk resolves, which are the ones worth having.
//
// tunnelRoute proxies browser events through /monitoring instead of straight to
// ingest.sentry.io, which ad blockers block by default - without it the errors
// most worth seeing (the ones hitting users who run uBlock) are the ones that
// never arrive. It is a build-injected rewrite, so /monitoring must also be
// allowlisted in src/proxy.ts or the gate 307s those POSTs to /login.
export default process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      // Source-map upload needs all three; missing any one downgrades to
      // "errors arrive, stack traces are minified" rather than a failed build.
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      widenClientFileUpload: true,
      tunnelRoute: "/monitoring",
    })
  : nextConfig;
