import { sitePath } from "@/lib/site-root";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { CLEAN } from "@/lib/pr-landing";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { HOSTED_HEADER, HOSTED_PATHS, hostedBase, hostedPath, siteOrigin } from "@/lib/hosted-blog";
import { readSiteTheme } from "@/lib/hosted-theme";
import { fetchProjectUrl } from "@/lib/url-guard";
import { isCloudMode } from "@/lib/cloud";
import { enqueue } from "@/lib/jobs";
import { randomBytes } from "node:crypto";

// Making a site's /blog point at the hosted blog: the one line in the
// customer's repo that forwards /blog/* to <backend>/hosted/<slug>/blog/*.
//
// WHICH LINE depends on where the site is deployed, not on its framework:
//   vercel.json "rewrites"   any framework on Vercel (and every Next.js repo,
//                            which Vercel serves by default)
//   _redirects with 200      Netlify (and Cloudflare Pages reads the same
//                            file, though it will not proxy - owners there
//                            get the manual snippet)
//   anything else            a snippet the settings card shows the owner
//
// The pull request is opened best-effort and merged on Auto. Nothing here
// blocks publishing: the pages exist at our address from the first article,
// and the settings card says whether the site's own /blog answers yet
// (checkRewriteLive looks for the marker header the hosted routes send).

const BRANCH = "dispatchseo/hosted-blog";
/** How long a forwarding pull request that adds code waits for the repo's
 *  checks before it is merged anyway (mergeRewritePrNow). */
const CHECKS_GRACE_MS = 15 * 60_000;
/** Checks still running after this long are not waited for any more. */
const CHECKS_PENDING_MAX_MS = 2 * 3_600_000;

/** Addressed by the project's random hosted key, never its slug: slugs are
 *  reused after a delete and a stale forwarding rule would then serve the
 *  next tenant's articles on the old customer's domain. */
export function rewriteDestination(backend: string, key: string): string {
  return `${backend}/hosted/${encodeURIComponent(key)}/blog`;
}

export function mintHostedKey(): string {
  return randomBytes(9).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || randomBytes(6).toString("hex");
}

/** The public path's leading-slash form ("/blog", "/articles"). Every rule
 *  below listens on it; the destination is always our /blog address. */
function pub(path: string = "blog"): string {
  return `/${path}`;
}

export function manualSnippet(backend: string, slug: string, path: string = "blog"): { vercel: string; netlify: string; next: string } {
  const dest = rewriteDestination(backend, slug);
  const P = pub(path);
  return {
    vercel: JSON.stringify({ rewrites: [{ source: P, destination: dest }, { source: `${P}/:path*`, destination: `${dest}/:path*` }] }, null, 2),
    netlify: `${P}  ${dest}  200\n${P}/*  ${dest}/:splat  200\n`,
    // beforeFiles: a plain array runs AFTER the filesystem, so a site that
    // already has an app/blog or pages/blog page (a template blog) would
    // keep serving it and the rule would never fire.
    next: `// next.config.js\nasync rewrites() {\n  return {\n    beforeFiles: [\n      { source: "${P}", destination: "${dest}" },\n      { source: "${P}/:path*", destination: "${dest}/:path*" },\n    ],\n  };\n}`,
  };
}

/** Merge our two rewrites into an existing vercel.json without disturbing
 *  anything else in it. Idempotent. */
export function withVercelRewrites(existing: string | null, backend: string, slug: string, path: string = "blog"): string | null {
  let json: Record<string, unknown> = {};
  if (existing) {
    try {
      json = JSON.parse(existing) as Record<string, unknown>;
    } catch {
      return null; // never replace a file we could not read
    }
    // Vercel rejects `rewrites` next to the legacy `routes` key, and the
    // deploy would fail on merge. That owner gets the manual snippet.
    if (json.routes !== undefined) return null;
  }
  const dest = rewriteDestination(backend, slug);
  const P = pub(path);
  const ours = [
    { source: P, destination: dest },
    { source: `${P}/:path*`, destination: `${dest}/:path*` },
  ];
  const current = Array.isArray(json.rewrites) ? (json.rewrites as { source?: string }[]) : [];
  const kept = current.filter((r) => r.source !== P && r.source !== `${P}/:path*`);
  json.rewrites = [...ours, ...kept];
  return JSON.stringify(json, null, 2) + "\n";
}

export function withNetlifyRedirects(existing: string | null, backend: string, slug: string, path: string = "blog"): string {
  const dest = rewriteDestination(backend, slug);
  const P = pub(path);
  const lines = (existing ?? "").split("\n").filter((l) => !(l.trim().startsWith(`${P} `) || l.trim().startsWith(`${P}\t`) || l.trim().startsWith(`${P}/* `) || l.trim().startsWith(`${P}/*\t`)));
  const body = lines.join("\n").replace(/\n*$/, "");
  return `${body ? body + "\n" : ""}${P}  ${dest}  200\n${P}/*  ${dest}/:splat  200\n`;
}

/** One file the forwarding pull request writes (content) or removes (null). */
export type PlanFile = { path: string; content: string | null };

export type RewritePlan =
  | { kind: "vercel" | "netlify" | "next-proxy" | "next-config" | "next-remove-blog" | "tanstack" | "lovable"; files: PlanFile[] }
  | { kind: "manual"; why?: ManualWhy };

/** Why no rule could be written, where the reason changes what happens next:
 *    route-taken     the app already has a page at that path (a TanStack
 *                    route file); planRepoRewrite tries a second path.
 *    lovable-legacy  a Lovable project on Lovable's older setup (a Vite
 *                    single-page app): nothing runs on the server, so there
 *                    is nowhere to forward from until the owner upgrades it
 *                    in Lovable. Setup says exactly that.
 *    start-too-old   a TanStack Start version from before route files could
 *                    answer requests themselves. */
export type ManualWhy = "route-taken" | "lovable-legacy" | "start-too-old";

// --- TanStack Start apps, and Lovable ------------------------------------
//
// A TanStack Start app answers requests from route files, so ONE new file -
// src/routes/<path>/$.ts, a splat route with a GET handler - forwards the
// path and everything under it, on whatever host runs the app. Nothing of
// the owner's is edited, and the generated route tree is rebuilt by the
// app's own build.
//
// LOVABLE is why this exists. Every Lovable project made since 2026-05-13 is
// a TanStack Start app, and on Lovable's hosting a push to the repo never
// goes live: only the Publish button in Lovable does. So articles committed
// to the repo would each wait for a click, while this one file needs ONE
// click, ever - after it, every article is live the moment we publish it.
// Hand-tested 2026-11-14 on a new Lovable project (crumb-test-bakery): the
// file pushed from GitHub, one Publish, and <path>, <path>/ and
// <path>/<page> all answered from the other origin with our headers intact;
// a second push changed nothing live until the next Publish; a file in
// public/ was served at the site root.
//
// Two kinds write the same file. "lovable" is that file on Lovable's own
// hosting, where the owner's Publish click is what makes it live (the
// dashboard asks for that one click); "tanstack" is the same app deployed
// anywhere that builds on push.

/** `<dir>` when this is a TanStack Start app whose route files can answer
 *  requests, "too-old" when its version predates that, null when it is not
 *  a TanStack Start app at all. */
export function tanstackRoutes(paths: string[], packageJson: string | null): { dir: string } | "too-old" | null {
  const spec = depSpec(packageJson, "@tanstack/react-start");
  if (spec === null) return null;
  const dir = ["src/routes", "app/routes"].find((d) => paths.some((p) => new RegExp(`^${d}/__root\\.(tsx|jsx|ts|js)$`).test(p)));
  if (!dir) return null;
  // createFileRoute(...)({ server: { handlers } }) is the 1.x release
  // candidates' API (1.132, autumn 2025, to our knowledge; Lovable's
  // template, hand-tested, pins 1.168). Before it, server routes were a
  // different API, and this file would not build there. An unreadable
  // version ("latest", a workspace link) is taken as current.
  const v = spec.match(/(\d+)\.(\d+)/);
  if (v && (Number(v[1]) < 1 || (Number(v[1]) === 1 && Number(v[2]) < 132))) return "too-old";
  return { dir };
}

/** A dependency's version spec from package.json (either list), "" when it
 *  is listed with no readable spec, null when it is not listed. */
function depSpec(packageJson: string | null, name: string): string | null {
  if (!packageJson) return null;
  try {
    const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> };
    const spec = pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
    return spec === undefined ? null : typeof spec === "string" ? spec : "";
  } catch {
    return null;
  }
}

/** Is this repo a Lovable project, and on which of Lovable's two setups?
 *  "start" = the TanStack Start template (every project since 2026-05-13,
 *  and older ones their owner upgraded); "legacy" = the Vite single-page
 *  template before it. Read from what Lovable itself puts in the repo: its
 *  build config package, its component tagger, or its .lovable/ folder. */
export function lovableProject(paths: string[], packageJson: string | null): "start" | "legacy" | null {
  const marked =
    depSpec(packageJson, "@lovable.dev/vite-tanstack-config") !== null ||
    depSpec(packageJson, "lovable-tagger") !== null ||
    paths.some((p) => p.startsWith(".lovable/"));
  if (!marked) return null;
  return depSpec(packageJson, "@tanstack/react-start") !== null ? "start" : "legacy";
}

/** Does a route file of the app already answer at /<path>? Flat names
 *  (blog.tsx, blog.index.tsx, blog_.$slug.tsx) and folders (blog/...) alike;
 *  layout folders (_app/) and groups ((marketing)/) add nothing to the
 *  address, so a blog.tsx inside one counts too. */
export function tanstackRouteTaken(paths: string[], dir: string, path: string, ours: string[] = []): boolean {
  return paths.some((p) => {
    if (!p.startsWith(`${dir}/`) || ours.includes(p)) return false;
    const rel = p.slice(dir.length + 1).replace(/\.(tsx|ts|jsx|js|mdx)$/, "");
    const segments = rel
      .split("/")
      .flatMap((part) => part.split("."))
      .filter((part) => part && !part.startsWith("_") && !/^\(.*\)$/.test(part));
    return (segments[0] ?? "").replace(/_$/, "").toLowerCase() === path.toLowerCase();
  });
}

/** The route file. One plain page name at most reaches us (an article,
 *  feed.xml, sitemap.xml): the name is decoded (a router may hand it over
 *  either way, and decoding first means the check sees what we would send)
 *  and one with a slash, a dot-dot or anything left encoded is answered 404
 *  here, so no address typed on the owner's domain can walk out of their
 *  own blog on our side. Only the headers a
 *  blog page needs travel back - its security policy among them, the same
 *  one a Vercel or Netlify rewrite carries: an article page must never run a
 *  script on the owner's domain (hosted-blog.ts CSP). Never an encoding
 *  header: the body is passed on as it is, and the host compresses it. */
export function tanstackRouteContent(dest: string, opts: { ts: boolean; path?: string }): string {
  const P = pub(opts.path);
  const t = opts.ts;
  return (
    `import { createFileRoute } from "@tanstack/react-router";\n` +
    `\n` +
    `// Added by DispatchSEO: ${P} and everything under it is served by your\n` +
    `// hosted blog, under your own domain. Remove this file to take it back.\n` +
    `const BLOG = "${dest}";\n` +
    `const PASS = [\n` +
    `  "content-type",\n` +
    `  "cache-control",\n` +
    `  "etag",\n` +
    `  "last-modified",\n` +
    `  "location",\n` +
    `  "x-robots-tag",\n` +
    `  "content-security-policy",\n` +
    `  "x-content-type-options",\n` +
    `  "referrer-policy",\n` +
    `  "${HOSTED_HEADER}",\n` +
    `];\n` +
    `\n` +
    `async function forward(request${t ? ": Request" : ""}, rest${t ? ": string | undefined" : ""})${t ? ": Promise<Response>" : ""} {\n` +
    `  let page = (rest ?? "").replace(/\\/$/, "");\n` +
    `  try {\n` +
    `    page = decodeURIComponent(page);\n` +
    `  } catch {\n` +
    `    page = "/";\n` +
    `  }\n` +
    `  if (page && !/^[\\p{L}\\p{N}][\\p{L}\\p{N}._~-]*$/u.test(page)) {\n` +
    `    return new Response("No such page", { status: 404 });\n` +
    `  }\n` +
    `  const target = BLOG + (page ? "/" + encodeURIComponent(page) : "") + new URL(request.url).search;\n` +
    `  let upstream${t ? ": Response" : ""};\n` +
    `  try {\n` +
    `    upstream = await fetch(target, { redirect: "manual" });\n` +
    `  } catch {\n` +
    `    return new Response("The blog is not answering right now.", { status: 502 });\n` +
    `  }\n` +
    `  const headers = new Headers();\n` +
    `  for (const name of PASS) {\n` +
    `    const value = upstream.headers.get(name);\n` +
    `    if (value) headers.set(name, value);\n` +
    `  }\n` +
    `  return new Response(upstream.body, { status: upstream.status, headers });\n` +
    `}\n` +
    `\n` +
    `export const Route = createFileRoute("${P}/$")({\n` +
    `  server: {\n` +
    `    handlers: {\n` +
    `      GET: ({ request, params }) => forward(request, params._splat),\n` +
    `    },\n` +
    `  },\n` +
    `});\n`
  );
}

// --- Next.js sites that already have a /blog page -------------------------
//
// Vercel gives the filesystem precedence over vercel.json rewrites, and a
// plain `rewrites()` array in next.config runs after the filesystem too. So a
// repo that ships a /blog page of its own - a template blog with no posts
// (ShipFast on easyrender.app, 2026-11-09) - keeps serving that page and the
// vercel.json rule never fires. Three things do win, tried in this order:
//   next-proxy        a new proxy.ts (Next 16+) or middleware.ts that rewrites
//                     /blog to us; runs before every route; nothing of theirs
//                     is edited. Only when the repo has no such file.
//   next-config       `rewrites()` returning { beforeFiles } inserted into a
//                     next.config whose shape is a plain object literal.
//   next-remove-blog  the template page removed, plus the vercel.json rule.
//                     Only for a /blog that serves no posts, and that pull
//                     request is never merged by us (mergeRewritePr).

/** The repo's own /blog page files (app router or pages router, root or src/). */
export function nextBlogRoute(paths: string[], path: string = "blog"): { dir: string; files: string[] } | null {
  // `path` is always one plain segment (hostedPath guarantees [a-z0-9-]).
  const page = paths.find((p) => new RegExp(`^(src\\/)?app\\/${path}\\/page\\.(js|jsx|ts|tsx|mdx)$`).test(p));
  if (page) {
    const dir = page.replace(/\/page\.[a-z]+$/, "");
    return { dir, files: paths.filter((p) => p === dir || p.startsWith(`${dir}/`)) };
  }
  const file = paths.find((p) => new RegExp(`^(src\\/)?pages\\/${path}(\\/index)?\\.(js|jsx|ts|tsx|mdx)$`).test(p));
  if (file) {
    const dir = file.replace(/(\/index)?\.[a-z]+$/, "");
    return { dir, files: paths.filter((p) => p === file || p.startsWith(`${dir}/`)) };
  }
  return null;
}

/** An existing proxy/middleware file - Next allows exactly one. */
export function nextProxyFile(paths: string[]): string | null {
  return paths.find((p) => /^(src\/)?(proxy|middleware)\.(js|jsx|ts|tsx|mjs|cjs)$/.test(p)) ?? null;
}

/** The major version of `next` in package.json, or null when unreadable. */
export function nextMajor(packageJson: string | null): number | null {
  if (!packageJson) return null;
  try {
    const pkg = JSON.parse(packageJson) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const spec = pkg.dependencies?.next ?? pkg.devDependencies?.next ?? "";
    const m = spec.match(/(\d+)\./) ?? spec.match(/(\d+)$/);
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** The proxy (Next 16+) or middleware file that forwards /blog to `dest`. */
export function nextProxyContent(dest: string, opts: { ts: boolean; proxy: boolean; path?: string }): string {
  const fn = opts.proxy ? "proxy" : "middleware";
  const P = pub(opts.path);
  const typeImport = opts.ts ? `import type { NextRequest } from "next/server";\n` : "";
  const param = opts.ts ? "request: NextRequest" : "request";
  return (
    `import { NextResponse } from "next/server";\n` +
    typeImport +
    `\n` +
    `// Added by DispatchSEO: ${P} and everything under it is served by your\n` +
    `// hosted blog, under your own domain. Remove this file to take it back.\n` +
    `const BLOG = "${dest}";\n` +
    `\n` +
    `export function ${fn}(${param}) {\n` +
    `  const { pathname, search } = request.nextUrl;\n` +
    `  const rest = pathname === "${P}" ? "" : pathname.slice("${P}".length);\n` +
    `  return NextResponse.rewrite(new URL(\`\${BLOG}\${rest}\${search}\`));\n` +
    `}\n` +
    `\n` +
    `export const config = { matcher: ["${P}", "${P}/:path*"] };\n`
  );
}

/** next.config with a beforeFiles rewrite inserted at the top of its config
 *  object. Null when the file is not a plain object literal we can read, or
 *  already defines rewrites - that owner gets the manual snippet. */
export function withNextConfigRewrites(existing: string, dest: string, path: string = "blog"): string | null {
  const P = pub(path);
  if (/\brewrites\s*\(/.test(existing) || /\brewrites\s*:/.test(existing)) return null;
  const opener = existing.match(/(const\s+\w+\s*(?::\s*NextConfig)?\s*=\s*\{|module\.exports\s*=\s*\{|export\s+default\s*\{)/);
  if (!opener || opener.index === undefined) return null;
  const at = opener.index + opener[0].length;
  const block =
    `\n  // Added by DispatchSEO: ${P} is served by your hosted blog, under your\n` +
    `  // domain. beforeFiles, so it runs before this app's own ${P} page.\n` +
    `  async rewrites() {\n` +
    `    return {\n` +
    `      beforeFiles: [\n` +
    `        { source: "${P}", destination: "${dest}" },\n` +
    `        { source: "${P}/:path*", destination: "${dest}/:path*" },\n` +
    `      ],\n` +
    `    };\n` +
    `  },`;
  return existing.slice(0, at) + block + existing.slice(at);
}

/**
 * Which directory of the repo is the deployed site. The root, normally. In a
 * monorepo (no next.config / vercel.json / netlify.toml at the root) it is the
 * one app under apps/ or packages/ that carries one - Vercel and Netlify read
 * the config from the project's root directory, so a rewrite written at the
 * monorepo root is never seen (audit C4). Several candidates: a conventional
 * site name wins (web, site, www, landing, marketing, frontend), else no
 * guess - "" with ambiguous=true, and the owner gets the manual snippet.
 */
export function siteAppRoot(paths: string[]): { root: string; ambiguous: boolean } {
  const marker = /^(next\.config\.(js|mjs|ts|cjs)|vercel\.json|netlify\.toml)$/;
  if (paths.some((p) => marker.test(p))) return { root: "", ambiguous: false };
  const apps = new Set<string>();
  for (const p of paths) {
    const m = p.match(/^((?:apps|packages)\/[^/]+)\/([^/]+)$/);
    if (m && marker.test(m[2])) apps.add(m[1]);
  }
  if (apps.size === 1) return { root: [...apps][0], ambiguous: false };
  if (apps.size > 1) {
    const named = [...apps].filter((a) => /\/(web|site|www|landing|marketing|frontend)$/.test(a));
    if (named.length === 1) return { root: named[0], ambiguous: false };
    return { root: "", ambiguous: true };
  }
  return { root: "", ambiguous: false };
}

export type RepoFiles = {
  vercelJson: string | null;
  redirects: string | null;
  /** The app's next.config.* (path relative to the app root) and its text. */
  nextConfig: { path: string; content: string } | null;
  packageJson: string | null;
  /** Route files in the app that are OURS (a forwarding file from an earlier
   *  plan, read and recognised by its first comment): planning the same path
   *  again must not find it "taken" by its own file. */
  ownRoutes?: string[];
};

/** Decide the files from the repo's listing (relative to the deployed app). */
/** Where the live site is served, read from its response headers. Vercel
 *  and Netlify announce themselves; anything else (a VPS, Render, Fly, a
 *  Docker box) reads vercel.json and _redirects as plain files, so only an
 *  in-app rule can forward there. "unknown" = the site did not answer. */
export type SiteHost = "vercel" | "netlify" | "other" | "unknown";

export async function detectSiteHost(project: Pick<Project, "domain"> & { hosted_origin?: string | null }): Promise<SiteHost> {
  const res = await fetchProjectUrl(`${siteOrigin(project)}/`, project.domain, { timeoutMs: 6_000, userAgent: "DispatchSEO-Check/1.0" }).catch(() => null);
  if (!res) return "unknown";
  const server = (res.headers.get("server") ?? "").toLowerCase();
  if (server.includes("vercel") || res.headers.has("x-vercel-id")) return "vercel";
  if (server.includes("netlify") || res.headers.has("x-nf-request-id")) return "netlify";
  return "other";
}

/** `path` = the public path the rule listens on (hostedPath); default "blog". */
export type PlanOptions = { blogEmpty?: boolean; host?: SiteHost; avoid?: RewritePlan["kind"][]; path?: string };

export function planRewrite(paths: string[], existing: RepoFiles, backend: string, slug: string, opts: PlanOptions = {}): RewritePlan {
  const has = (p: string) => paths.includes(p);
  const avoid = new Set(opts.avoid ?? []);
  const host: SiteHost = opts.host ?? "unknown";
  const path = opts.path ?? "blog";
  const isNext = paths.some((p) => /^next\.config\.(js|mjs|ts|cjs)$/.test(p));
  // Netlify evidence (in the repo or on the wire) wins over the Next.js
  // guess: a Next app deployed on Netlify ignores vercel.json entirely.
  const onNetlify = host === "netlify" || has("netlify.toml") || has("public/_redirects") || has("_redirects");
  if (onNetlify && !avoid.has("netlify")) {
    const file = has("public/_redirects") ? "public/_redirects" : has("_redirects") ? "_redirects" : paths.some((p) => p.startsWith("public/")) ? "public/_redirects" : "_redirects";
    return { kind: "netlify", files: [{ path: file, content: withNetlifyRedirects(existing.redirects, backend, slug, path) }] };
  }
  const dest = rewriteDestination(backend, slug);
  const vercelPlan = (): RewritePlan | null => {
    if (avoid.has("vercel")) return null;
    const content = withVercelRewrites(existing.vercelJson, backend, slug, path);
    return content ? { kind: "vercel", files: [{ path: "vercel.json", content }] } : null;
  };
  if (isNext) {
    const blog = nextBlogRoute(paths, path);
    // vercel.json only when the live site is on Vercel (or unseen) AND the
    // app has no /blog page of its own - Vercel's filesystem beats that file
    // (easyrender.app, 2026-11-09), and a self-hosted Next app never reads
    // it at all. Everything else forwards inside the app, which works on
    // any host once the site is deployed.
    if (host !== "other" && !blog) {
      const plan = vercelPlan();
      if (plan) return plan;
    }
    // A static export (output: "export", GitHub Pages or any plain file
    // host) has no server to forward from: Next refuses a proxy/middleware
    // or rewrites with it at build time, so adding either would fail every
    // deploy of the owner's site from then on. The owner adds the rule on
    // their host instead.
    if (/\boutput\s*:\s*["'`]export["'`]/.test(existing.nextConfig?.content ?? "")) return { kind: "manual" };
    if (!nextProxyFile(paths) && !avoid.has("next-proxy")) {
      const src = !paths.some((p) => /^(app|pages)\//.test(p)) && paths.some((p) => /^src\/(app|pages)\//.test(p));
      const ts = has("tsconfig.json");
      const proxy = (nextMajor(existing.packageJson) ?? 0) >= 16;
      const file = `${src ? "src/" : ""}${proxy ? "proxy" : "middleware"}.${ts ? "ts" : "js"}`;
      return { kind: "next-proxy", files: [{ path: file, content: nextProxyContent(dest, { ts, proxy, path }) }] };
    }
    if (existing.nextConfig && !avoid.has("next-config")) {
      const edited = withNextConfigRewrites(existing.nextConfig.content, dest, path);
      if (edited) return { kind: "next-config", files: [{ path: existing.nextConfig.path, content: edited }] };
    }
    // Removing a template page is only ever about the site's own /blog; at a
    // second path there is nothing of theirs we would take out.
    if (path === "blog" && blog && opts.blogEmpty && blog.files.length && host !== "other" && !avoid.has("next-remove-blog")) {
      const vercel = withVercelRewrites(existing.vercelJson, backend, slug, path);
      if (vercel) return { kind: "next-remove-blog", files: [...blog.files.map((path) => ({ path, content: null })), { path: "vercel.json", content: vercel }] };
    }
    return { kind: "manual" };
  }
  // A TanStack Start app forwards from inside itself, on any host. On
  // Lovable's hosting that is the only way in, and it is its own kind: the
  // owner's Publish click is what makes it live there.
  const lovable = lovableProject(paths, existing.packageJson);
  const onLovableHosting = lovable !== null && host !== "vercel" && host !== "netlify";
  const start = tanstackRoutes(paths, existing.packageJson);
  let why: ManualWhy | undefined;
  if (start && !avoid.has("tanstack") && !avoid.has("lovable")) {
    // Too old for a route file: not the end - a host rule below may still
    // apply (the same app on Vercel), and only then is it "manual".
    if (start === "too-old") why = "start-too-old";
    else {
      if (tanstackRouteTaken(paths, start.dir, path, existing.ownRoutes)) return { kind: "manual", why: "route-taken" };
      const ts = has("tsconfig.json");
      // Our own file from an earlier plan is written over in place, under
      // the name it already has.
      const file = existing.ownRoutes?.find((p) => new RegExp(`^${start.dir}/${path}/\\$\\.(ts|js)$`).test(p)) ?? `${start.dir}/${path}/$.${ts ? "ts" : "js"}`;
      return {
        kind: onLovableHosting ? "lovable" : "tanstack",
        files: [{ path: file, content: tanstackRouteContent(dest, { ts: file.endsWith(".ts"), path }) }],
      };
    }
  }
  // Lovable's older setup, on Lovable's own hosting: a single-page app with
  // nothing running on the server, and a host that takes no forwarding rule.
  if (lovable === "legacy" && onLovableHosting) return { kind: "manual", why: "lovable-legacy" };
  // vercel.json is read by Vercel only, from the deployed app's own
  // directory: write one when the repo already has it, or when the live site
  // answered from Vercel AND this is plainly the app (a repo of several apps
  // with no marker would get the file at a root Vercel never reads).
  const severalApps = paths.some((p) => /^(apps|packages)\//.test(p));
  if ((has("vercel.json") && host !== "other") || (host === "vercel" && !severalApps)) {
    const plan = vercelPlan();
    if (plan) return plan;
  }
  return why ? { kind: "manual", why } : { kind: "manual" };
}

/** Is this site a Lovable project served by Lovable's own hosting? There a
 *  push to the repo never reaches the live site (only Publish in Lovable
 *  does), so an article committed to the repo would wait for a click every
 *  time: such a site always takes the hosted blog, whatever its repo holds.
 *  False when it could not be read - the caller keeps its usual answer. */
export async function onLovableHosting(project: Project): Promise<boolean> {
  const repo = project.github_repo;
  if (!repo) return false;
  const token = await tokenForRef(project);
  if (!token) return false;
  const [pkg, marker] = await Promise.all([
    githubApi(token, "GET", `/repos/${repo}/contents/package.json`),
    githubApi(token, "GET", `/repos/${repo}/contents/.lovable/project.json`),
  ]);
  const content = pkg.json?.content;
  const packageJson = typeof content === "string" ? Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8") : null;
  if (lovableProject(marker.status === 200 ? [".lovable/project.json"] : [], packageJson) === null) return false;
  const host = await detectSiteHost(project);
  return host !== "vercel" && host !== "netlify";
}

/** A forwarding change that only goes live when the owner presses Publish in
 *  Lovable, and has not yet. The dashboard asks for that one click while
 *  this is true (first-article-progress.ts), and Google's confirmation waits
 *  for the same click (job-handlers/launch.ts). */
export function lovablePublishPending(project: Pick<Project, "publish_target" | "hosted_rewrite_state" | "hosted_rewrite_live_at">): boolean {
  // "live:lovable" = it answered once (checkRewriteLive). Live is a one-way
  // door for this question: a later blip that clears the stamp must not put
  // an established site back on "press Publish", or mail its owner again.
  const state = project.hosted_rewrite_state ?? "";
  return project.publish_target === "hosted" && !project.hosted_rewrite_live_at && !state.startsWith("live:") && forwardingKind(state) === "lovable";
}

/** The Lovable forwarding file is merged into the repo (so a Publish click
 *  now carries it), as far as the row knows. */
export function lovableFileMerged(project: Pick<Project, "hosted_rewrite_state">): boolean {
  return (project.hosted_rewrite_state ?? "").startsWith("merged:lovable");
}

/** An owner who merges the forwarding pull request themselves (a site not on
 *  Auto) leaves the row saying "opened": nothing of ours ran. Asked while
 *  their first-article card is open, so it can move from "merge it" to
 *  "press Publish". One GitHub read; true when the row was moved on. */
export async function syncRewriteMerged(project: Project): Promise<boolean> {
  const repo = project.github_repo;
  const number = (project.hosted_rewrite_pr_url ?? "").match(/\/pull\/(\d+)/)?.[1];
  if (!repo || !number || !(project.hosted_rewrite_state ?? "").startsWith("opened:")) return false;
  const token = await tokenForRef(project);
  if (!token) return false;
  const pr = await githubApi(token, "GET", `/repos/${repo}/pulls/${number}`);
  if (pr.status !== 200 || !pr.json?.merged) return false;
  const { data } = await db().from("projects").update({ hosted_rewrite_state: mergedState(project) }).eq("id", project.id).eq("hosted_rewrite_state", project.hosted_rewrite_state as string).select("id");
  return Boolean(data?.length);
}

/**
 * Flip the project to the hosted route and open the rewrite pull request.
 * Returns the updated project, or null only when the flip itself failed
 * (the PR is best effort and its absence is recorded, not thrown).
 *
 * `secondPath`: the caller has established that the site's own /blog, if it
 * has one, cannot take our articles (repo publishing found no folder of
 * posts). Then a real blog at /blog is no longer a reason to give up: the
 * hosted blog answers at the first free path of HOSTED_PATHS instead
 * (/articles), and their blog is never touched. Without it, a site with its
 * own /blog is refused, as before - the owner's own choice of "hosted" from
 * Settings or MCP must never quietly land somewhere other than /blog.
 */
export async function switchToHostedBlog(project: Project, opts: { secondPath?: boolean; /** The caller just probed the site and it serves its own /blog. */ ownBlog?: true } = {}): Promise<Project | null> {
  // A site that already serves a /blog (a CMS-backed one the repo scan could
  // not see, or anything else) must not have it forwarded away from under
  // it. "No markdown folder" is not "no blog".
  //
  // A path chosen on an earlier attempt is kept as it is: once our rule is
  // live it answers with our marker, and re-deciding would only flip-flop.
  let path: string | null = project.hosted_path && hostedPath(project) !== "blog" ? hostedPath(project) : null;
  // The caller's "yes" is taken as it is: a second probe a moment later can
  // answer differently (a 5xx blip), and "no" there would forward the
  // owner's own /blog to ours.
  if (!path && (opts.ownBlog || (await servesOwnBlog(project)))) {
    if (!opts.secondPath) return null;
    path = await firstFreePath(project);
    if (!path) return null;
  }

  const key = project.hosted_key ?? mintHostedKey();
  const { data, error } = await db()
    .from("projects")
    // hosted_path only when there is one: a DB that has not run 0084 must
    // keep switching /blog sites exactly as before.
    .update({ publish_target: "hosted", hosted_key: key, ...(path ? { hosted_path: path } : {}) })
    .eq("id", project.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  const updated: Project = { ...project, publish_target: "hosted", hosted_key: key, ...(path ? { hosted_path: path } : {}) };
  // The site's colours and logo, read once from its homepage. Best effort:
  // an unreadable homepage leaves the default theme, which the owner can
  // change on Settings.
  if (!updated.hosted_theme) {
    try {
      const read = await readSiteTheme(updated);
      if (read) {
        await db().from("projects").update({ hosted_theme: read.theme, hosted_origin: read.origin }).eq("id", updated.id);
        updated.hosted_theme = read.theme;
        updated.hosted_origin = read.origin;
      }
    } catch (e) {
      console.warn("[hosted] theme not read:", e instanceof Error ? e.message : e);
    }
  }
  try {
    // servesOwnBlog said no just above: a /blog page in the repo, if any,
    // serves no posts, which is what lets the plan remove a template one.
    const pr = await openRewritePr(updated, { blogEmpty: true });
    if (pr) {
      updated.hosted_rewrite_pr_url = pr.url;
      // The state openRewritePr just stored, on the copy the merge reads:
      // without it the merge saw whatever the row held before (nothing, or
      // an older plan's kind) and judged the wrong kind of change.
      updated.hosted_rewrite_state = `opened:${pr.kind}`;
      // openRewritePr moved it to a second path (the app's own /blog page).
      if (pr.path !== hostedPath(updated)) updated.hosted_path = pr.path;
    }
    // On Auto the owner was promised a blog that switches on by itself, so
    // the forwarding pull request is merged here too (launch.ts does the
    // same for a site the setup launched). Best effort: a refused merge
    // leaves the PR open and the card links it.
    if (pr && updated.auto_merge) await mergeRewritePr(updated, pr.url).catch((e) => console.warn("[hosted] rewrite PR not merged:", e instanceof Error ? e.message : e));
  } catch (e) {
    console.warn("[hosted] rewrite PR not opened:", e instanceof Error ? e.message : e);
  }
  // Watch for the site's /blog to start answering from us: the first-article
  // email waits for that, and after a day with nothing the owner is told the
  // one rule we could not add (job-handlers/hosted-live.ts).
  await startHostedLiveWatch(updated.id).catch(() => undefined);
  // Drafts parked by the old "no folder" path now have somewhere to go.
  const { data: parked } = await db().from("article_drafts").select("id").eq("project_id", updated.id).eq("status", "blocked_setup");
  for (const d of (parked ?? []) as { id: string }[]) {
    await enqueue({ projectId: updated.id, kind: "publish", payload: { draftId: d.id }, idempotencyKey: `publish:${d.id}` }).catch(() => {});
  }
  return updated;
}

/** Does https://<domain>/blog already answer with a real BLOG that is not
 *  ours? 404 or our own marker = free. 401/403/429/5xx = taken, unless a
 *  random path gets that same answer (see below). Unreachable = free on cloud (a new
 *  site that is not live yet), but NOT on self-host: a backend that cannot
 *  see the site from where it runs (a LAN box) has no business pointing the
 *  site's public /blog at itself.
 *
 *  A 200 alone is not a blog (audit H2). Single-page apps and many hosted
 *  site builders answer EVERY path with the same 200 shell, so "200 on /blog"
 *  read as "they already have a blog" and the site was refused the hosted
 *  blog it needed. So /blog must (a) differ from a random path that cannot
 *  exist - same status and a body within 10% of the same length is a
 *  catch-all, not a page - and (b) look like a blog index: at least three
 *  links into /blog/<something>, or "blog" in its <title>. */
export async function servesOwnBlog(project: Project): Promise<boolean> {
  // A site in a folder: its blog is <folder>/blog, never the host's.
  const origin = `${siteOrigin(project)}${sitePath(project)}`;
  const init = { timeoutMs: 6_000, userAgent: "DispatchSEO-Check/1.0" };
  const res = await fetchProjectUrl(`${origin}/blog`, project.domain, init);
  if (!res) return !isCloudMode();
  if (res.headers.get(HOSTED_HEADER) === "1") return false;
  const probeUrl = `${origin}/dispatchseo-probe-${randomBytes(6).toString("hex")}`;
  if (res.status === 404 || res.status === 410) return false;
  if (res.status !== 200) {
    // A refusal is not "nothing there": a CMS blog behind bot protection
    // answers 403 to our check, and reading that as free would forward the
    // owner's real blog away. But some hosts (S3-style static hosting)
    // answer 403 to every unknown path, where /blog really is free. A path
    // that cannot exist tells the two apart: the same answer = the host says
    // that to anything; a 404 or a page while /blog was refused = /blog is
    // something real we were kept out of.
    const refused = res.status === 401 || res.status === 403 || res.status === 429 || res.status >= 500;
    if (!refused) return false;
    const probe = await fetchProjectUrl(probeUrl, project.domain, init);
    if (!probe || probe.status === res.status) return false;
    return probe.status === 404 || probe.status === 410 || probe.status === 200;
  }
  const body = await res.text().catch(() => "");
  const probe = await fetchProjectUrl(probeUrl, project.domain, init);
  if (probe && probe.status === 200) {
    const other = await probe.text().catch(() => "");
    const a = body.length;
    const b = other.length;
    if (Math.abs(a - b) <= Math.max(a, b) * 0.1) return false; // catch-all
  }
  return looksLikeBlogIndex(body);
}

/** The first of HOSTED_PATHS after "blog" that nothing on the site uses,
 *  or null. Free = answers 404/410, answers from us already, or is the
 *  same catch-all shell a random path gets. Anything else - a real page, a
 *  redirect to one, an unreachable site - is somebody's and is skipped:
 *  forwarding a path the owner uses would break their site. */
export async function firstFreePath(project: Project): Promise<string | null> {
  for (const path of HOSTED_PATHS.slice(1)) {
    if (await pathFree(project, path)) return path;
  }
  return null;
}

async function pathFree(project: Project, path: string): Promise<boolean> {
  const origin = `${siteOrigin(project)}${sitePath(project)}`;
  const init = { timeoutMs: 6_000, userAgent: "DispatchSEO-Check/1.0" };
  const res = await fetchProjectUrl(`${origin}/${path}`, project.domain, init);
  if (!res) return false;
  if (res.headers.get(HOSTED_HEADER) === "1") return true;
  if (res.status === 404 || res.status === 410) return true;
  if (res.status !== 200) return false;
  const body = await res.text().catch(() => "");
  const probe = await fetchProjectUrl(`${origin}/dispatchseo-probe-${randomBytes(6).toString("hex")}`, project.domain, init);
  if (!probe || probe.status !== 200) return false;
  const other = await probe.text().catch(() => "");
  return Math.abs(body.length - other.length) <= Math.max(body.length, other.length) * 0.1;
}

/** Exported for testing: the blog-index shape servesOwnBlog requires. */
export function looksLikeBlogIndex(html: string): boolean {
  // Posts, not navigation: a template blog ships category/tag pages and a
  // "Blog" title with zero articles behind them (ShipFast's /blog on
  // easyrender.app, 2026-11-09), and that is not a blog worth keeping.
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']*\/blog\/[^"'#?]+)["']/gi)) {
    const path = m[1].replace(/\/+$/, "");
    if (/\/blog\/(category|categories|tag|tags|topic|topics|author|authors|page|feed|rss)(\/|$)/i.test(path)) continue;
    links.add(path);
  }
  if (links.size >= 3) return true;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return /\bblog\b/i.test(title) && links.size >= 1;
}

/** What planning the forwarding rule read and decided (planRepoRewrite).
 *  `treeOk` / `readFailed` say whether the answer rests on a full read of the
 *  repo: a dry run (publish-route-check.ts) must not refuse a site on a plan
 *  made from a listing or a file GitHub did not return. */
export type RepoRewritePlanning = {
  token: string;
  repo: string;
  baseBranch: string;
  headSha: string;
  baseTree: string;
  /** The deployed app's directory with a trailing slash, "" at the root. */
  prefix: string;
  /** Paths relative to the deployed app. */
  appPaths: string[];
  ambiguous: boolean;
  /** The host the plan was made for; null when the monorepo was ambiguous
   *  (no plan was attempted, so the host was never read). */
  host: SiteHost | null;
  files: RepoFiles | null;
  plan: RewritePlan;
  /** The public path the plan listens on. The project's own, except when
   *  the app already has a page there and a second path was free. */
  path: string;
  treeOk: boolean;
  readFailed: boolean;
};

/**
 * The planning half of openRewritePr: read the repo's tree and the files the
 * rule edits, find the deployed app, read the host, and decide the plan.
 * Reads only - no branch, no pull request, no database write. Null when
 * GitHub could not be read far enough to plan. `key` is the hosted key the
 * rule points at (the plan's kind never depends on it).
 */
export async function planRepoRewrite(project: Project, key: string, opts: PlanOptions = {}): Promise<RepoRewritePlanning | null> {
  const repo = project.github_repo;
  if (!repo) return null;
  const token = await tokenForRef(project);
  if (!token) return null;
  const backend = await backendBaseUrl();

  const repoInfo = await githubApi(token, "GET", `/repos/${repo}`);
  if (repoInfo.status !== 200) return null;
  const baseBranch = String(repoInfo.json?.default_branch ?? "main");
  const ref = await githubApi(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${baseBranch}`)}`);
  const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
  if (!headSha) return null;
  const headCommit = await githubApi(token, "GET", `/repos/${repo}/git/commits/${headSha}`);
  const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
  if (!baseTree) return null;
  const treeRes = await githubApi(token, "GET", `/repos/${repo}/git/trees/${baseTree}?recursive=1`);
  const treeOk = treeRes.status === 200 && treeRes.json?.truncated !== true;
  const paths = ((treeRes.json?.tree as { path?: string; type?: string }[] | undefined) ?? []).filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));

  // The deployed app's own directory (a monorepo's apps/<x>), with paths
  // made relative to it so planRewrite reasons about that app alone.
  const app = siteAppRoot(paths);
  const prefix = app.root ? `${app.root}/` : "";
  const appPaths = prefix ? paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)) : paths;
  let readFailed = false;
  const read = async (rel: string): Promise<string | null> => {
    const path = `${prefix}${rel}`;
    if (!paths.includes(path)) return null;
    const res = await githubApi(token, "GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(baseBranch)}`);
    const content = res.json?.content;
    if (typeof content !== "string") readFailed = true;
    return typeof content === "string" ? Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8") : null;
  };
  let planned: RewritePlan = { kind: "manual" };
  let path = hostedPath(project);
  let host: SiteHost | null = null;
  let files: RepoFiles | null = null;
  if (!app.ambiguous) {
    host = opts.host ?? (await detectSiteHost(project));
    const nextConfigPath = appPaths.find((p) => /^next\.config\.(js|mjs|ts|cjs)$/.test(p)) ?? null;
    const nextConfigText = nextConfigPath ? await read(nextConfigPath) : null;
    // A splat route file already sitting where ours would go: ours when it
    // carries our comment (an earlier plan's file), the owner's otherwise.
    const ownRoutes: string[] = [];
    for (const candidate of appPaths.filter((p) => new RegExp(`^(src|app)/routes/(${HOSTED_PATHS.join("|")})/\\$\\.(ts|js)$`).test(p))) {
      if ((await read(candidate))?.includes("// Added by DispatchSEO:")) ownRoutes.push(candidate);
    }
    files = {
      vercelJson: await read("vercel.json"),
      redirects: (await read("public/_redirects")) ?? (await read("_redirects")),
      nextConfig: nextConfigPath && nextConfigText ? { path: nextConfigPath, content: nextConfigText } : null,
      packageJson: await read("package.json"),
      ownRoutes,
    };
    planned = planRewrite(appPaths, files, backend, key, { blogEmpty: Boolean(opts.blogEmpty), host, avoid: opts.avoid, path });
    // The app already has a page at /blog (a route file; the live check can
    // miss one that renders no posts, or is not published yet). Its page is
    // never shadowed: the hosted blog takes the first second path nothing
    // on the site or in the repo uses, as it does for a site with a real
    // blog. Only for a path nobody chose yet.
    if (planned.kind === "manual" && planned.why === "route-taken" && path === "blog" && !project.hosted_path) {
      for (const alt of HOSTED_PATHS.slice(1)) {
        if (!(await pathFree(project, alt))) continue;
        const again = planRewrite(appPaths, files, backend, key, { blogEmpty: false, host, avoid: opts.avoid, path: alt });
        if (again.kind === "manual") continue;
        planned = again;
        path = alt;
        break;
      }
    }
  }
  // A route file is only ever added on a full reading of the repo: on a
  // listing GitHub cut short, "no page at this path" is not known, and the
  // pull request could replace a route file of the owner's.
  if ((planned.kind === "tanstack" || planned.kind === "lovable") && !treeOk) planned = { kind: "manual" };
  return { token, repo, baseBranch, headSha, baseTree, prefix, appPaths, ambiguous: app.ambiguous, host, files, plan: planned, path, treeOk, readFailed };
}

export async function openRewritePr(project: Project, opts: PlanOptions = {}): Promise<{ url: string; merged: boolean; kind: RewritePlan["kind"]; path: string } | null> {
  if (!project.github_repo) return null;
  // Checked before planning rather than after it (as it once was): the
  // answer is the same null, without the GitHub reads.
  if (!project.hosted_key) return null;
  const planning = await planRepoRewrite(project, project.hosted_key, opts);
  if (!planning) return null;
  const { token, repo, baseBranch, headSha, baseTree, prefix, plan: planned } = planning;
  if (planned.kind === "manual") {
    await db().from("projects").update({ hosted_rewrite_pr_url: "manual", hosted_rewrite_state: "manual" }).eq("id", project.id);
    return null;
  }
  const plan = planned;
  // The plan moved to a second path (the app has its own page at /blog):
  // from here on the project IS at that path - the wording below, the row,
  // and every address the hosted blog prints.
  const moved = planning.path !== hostedPath(project);
  if (moved) project = { ...project, hosted_path: planning.path };
  const files = plan.files.map((f) => ({ ...f, path: `${prefix}${f.path}` }));

  const created = await githubApi(token, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: headSha });
  if (created.status === 422) {
    await githubApi(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${BRANCH}`)}`, { sha: headSha, force: true });
  } else if (created.status !== 201) return null;
  // A null sha in a tree entry deletes that path (the template blog page).
  const entries = files.map((f) => (f.content === null ? { path: f.path, mode: "100644", type: "blob", sha: null } : { path: f.path, mode: "100644", type: "blob", content: f.content }));
  const tree = await githubApi(token, "POST", `/repos/${repo}/git/trees`, { base_tree: baseTree, tree: entries });
  if (!tree.json?.sha) return null;
  const what = planWords(plan.kind, hostedPath(project));
  const commit = await githubApi(token, "POST", `/repos/${repo}/git/commits`, {
    message: `${what.title}\n\n${what.commit}`,
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (!commit.json?.sha) return null;
  await githubApi(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${BRANCH}`)}`, { sha: String(commit.json.sha), force: true });

  const base = hostedBase(project);
  const body =
    `${what.body}\n\n` +
    `\`${base}\` and everything under it is then served by DispatchSEO, under your domain, with your site name and a link back to your site. ` +
    (plan.kind === "lovable"
      ? `Once it is merged, press Publish in Lovable one time and your articles are live at ${base}. Nothing else in your site changes`
      : `Merge it and your articles are live at ${base} within a few minutes of the deploy. Nothing else in your site changes`) +
    (hostedPath(project) === "blog" ? ". " : `, and your own /blog stays exactly as it is. `) +
    `The same rule for other hosts is on your DispatchSEO settings screen.`;
  let prNumber: number | null = null;
  let url = "";
  const pr = await githubApi(token, "POST", `/repos/${repo}/pulls`, { title: what.title, head: BRANCH, base: baseBranch, body });
  if (pr.status === 201 && pr.json) {
    prNumber = Number(pr.json.number);
    url = String(pr.json.html_url ?? "");
  } else if (pr.status === 422) {
    const owner = repo.split("/")[0];
    const open = await githubApi(token, "GET", `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${BRANCH}`)}&state=open`);
    const first = (open.json as unknown as { number?: number; html_url?: string }[] | null)?.[0];
    if (!first?.number) return null;
    prNumber = Number(first.number);
    url = String(first.html_url ?? "");
  } else return null;

  // Not merged here: launch.ts and switchToHostedBlog merge it on Auto
  // through mergeRewritePr, which also refuses the template-removal kind.
  await db().from("projects").update({ hosted_rewrite_pr_url: url, hosted_rewrite_state: `opened:${plan.kind}`, ...(moved ? { hosted_path: planning.path } : {}) }).eq("id", project.id);
  return { url, merged: false, kind: plan.kind, path: planning.path };
}

/** Title doubles as the merge guard: a title carrying REMOVES_MARK is the
 *  template-removal kind, which deletes files and is the owner's merge. */
const REMOVES_MARK = "(removes the empty template blog)";
/** PLAN_WORDS for the public path the rule listens on: "/blog" in the
 *  stored wording becomes "/articles" for a second-path site. The title's
 *  REMOVES_MARK only ever exists on the /blog wording. */
function planWords(kind: Exclude<RewritePlan["kind"], "manual">, path: string): { title: string; commit: string; body: string } {
  const w = PLAN_WORDS[kind];
  if (path === "blog") return w;
  const swap = (t: string) => t.replace(/\/blog\b/g, `/${path}`);
  return { title: swap(w.title), commit: swap(w.commit), body: swap(w.body) };
}

const PLAN_WORDS: Record<Exclude<RewritePlan["kind"], "manual">, { title: string; commit: string; body: string }> = {
  vercel: {
    title: "Forward /blog to your hosted blog",
    commit: "One rewrite in vercel.json: your site's /blog is served by DispatchSEO under your own domain.",
    body: "This adds one forwarding rule to `vercel.json`.",
  },
  netlify: {
    title: "Forward /blog to your hosted blog",
    commit: "Two lines in _redirects: your site's /blog is served by DispatchSEO under your own domain.",
    body: "This adds one forwarding rule to `_redirects`.",
  },
  "next-proxy": {
    title: "Forward /blog to your hosted blog",
    commit: "A proxy that rewrites /blog to the DispatchSEO hosted blog, under your own domain. It runs before this app's own /blog page.",
    body: "This adds one small file that rewrites `/blog` before your app's own `/blog` page is matched (a plain rewrite would lose to that page).",
  },
  "next-config": {
    title: "Forward /blog to your hosted blog",
    commit: "A beforeFiles rewrite in next.config: /blog is served by the DispatchSEO hosted blog, under your own domain, ahead of this app's own /blog page.",
    body: "This adds a `beforeFiles` rewrite to your `next.config` so it runs before your app's own `/blog` page is matched.",
  },
  tanstack: {
    title: "Forward /blog to your hosted blog",
    commit: "One new route file: /blog and everything under it is served by the DispatchSEO hosted blog, under your own domain.",
    body: "This adds one small route file. It answers `/blog` and everything under it by fetching the page from your hosted blog.",
  },
  lovable: {
    title: "Forward /blog to your hosted blog",
    commit: "One new route file: /blog and everything under it is served by the DispatchSEO hosted blog, under your own domain. It goes live the next time you press Publish in Lovable.",
    body: "This adds one small route file. It answers `/blog` and everything under it by fetching the page from your hosted blog. It goes live the next time you press **Publish** in Lovable; after that, new articles appear without another Publish.",
  },
  "next-remove-blog": {
    title: `Forward /blog to your hosted blog ${REMOVES_MARK}`,
    commit: "Removes the template /blog page, which serves no posts, and adds the vercel.json rewrite that serves /blog from the DispatchSEO hosted blog under your own domain.",
    body: "Your `/blog` page is a template with no posts, so this removes it and adds the forwarding rule to `vercel.json`. Review the removed files before merging.",
  },
};

/** The one place a forwarding pull request is merged by us: for a site on
 *  Auto, whose owner was promised a blog that switches on with nothing else
 *  to do. Only our own branch, in the project's own repo, at the exact commit
 *  just read; never the template-removal kind (that deletes the owner's
 *  files and stays theirs to merge). A merge GitHub refuses (branch
 *  protection, a conflict) throws and leaves the PR open. A branch whose
 *  checks have not passed yet is left open without a throw; the hosted-live
 *  watch (job-handlers/hosted-live.ts) calls this again every pass. */
export async function mergeRewritePr(project: Project, prUrl: string): Promise<void> {
  try {
    await mergeRewritePrNow(project, prUrl);
  } catch (e) {
    const why = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    // The kind rides along ("merge-failed:lovable: ..."): what the change IS
    // decides what the dashboard asks for and whether it is ever re-planned,
    // and a refused merge does not change that.
    const kind = forwardingKind(project.hosted_rewrite_state);
    await db().from("projects").update({ hosted_rewrite_state: kind ? `merge-failed:${kind}: ${why}` : `merge-failed: ${why}` }).eq("id", project.id);
    throw e;
  }
}

async function mergeRewritePrNow(project: Project, prUrl: string): Promise<void> {
  const repo = project.github_repo;
  const number = prUrl.match(/\/pull\/(\d+)/)?.[1];
  if (!repo || !number) throw new Error("the forwarding pull request has no number we can read");
  const token = await tokenForRef(project);
  if (!token) throw new Error("no GitHub access to merge the forwarding pull request");

  const state = await githubApi(token, "GET", `/repos/${repo}/pulls/${number}`);
  if (state.status !== 200 || !state.json) throw new Error(`could not read the forwarding pull request (HTTP ${state.status})`);
  if (state.json.merged) {
    await db().from("projects").update({ hosted_rewrite_state: mergedState(project) }).eq("id", project.id);
    return;
  }
  if (state.json.state !== "open") throw new Error("the forwarding pull request was closed without merging");
  if (typeof state.json.title === "string" && state.json.title.includes(REMOVES_MARK)) {
    await db().from("projects").update({ hosted_rewrite_state: "owner-merge" }).eq("id", project.id);
    return;
  }

  // The stored URL is a pointer, not proof: merge only our own branch into
  // the project's own repo, at the exact commit we just looked at.
  const same = (a: unknown) => typeof a === "string" && a.toLowerCase() === repo.toLowerCase();
  const base = state.json.base as { repo?: { full_name?: string } } | undefined;
  const head = state.json.head as { ref?: string; sha?: string; repo?: { full_name?: string } } | undefined;
  if (!same(base?.repo?.full_name) || head?.ref !== BRANCH || !same(head?.repo?.full_name) || !head?.sha) {
    throw new Error("the stored pull request is not our forwarding pull request; left alone");
  }

  // A forwarding change that adds CODE to the owner's app (a proxy or
  // middleware file, an edited next.config, a removed template page) gets
  // the repo's checks a chance to speak before it is merged: merged the
  // second it opened, a change that breaks their build was on their main
  // branch before any check had run. A one-line host rule (vercel.json,
  // _redirects) cannot break a build and merges as it always did.
  //
  // What "a chance" means, and why it is not "wait until green":
  //  - GitHub calls the branch clean (or the repo has no checks): merge.
  //  - Otherwise wait CHECKS_GRACE_MS from when the pull request opened
  //    (the hosted-live watch calls this again every five minutes).
  //  - After that, merge UNLESS the checks can be read and one that passes
  //    on the base branch fails with our change - the one case where the
  //    red is known to be ours. Then it stays open; the dashboard's "Merge
  //    the forwarding pull request" card links it.
  //  - A check that is red on the owner's own branch too, a state GitHub
  //    will not explain (the App cannot read checks on most installs,
  //    repo-publish.ts pullRequestChecks), or checks still running after
  //    CHECKS_PENDING_MAX_MS: merge, as before. Waiting for green there
  //    would leave the blog address answering nothing for good on every
  //    repo with one check that is always red, with no one told.
  // A state without a readable kind is treated as code.
  let mergeable = state.json.mergeable_state;
  if (mergeable == null || mergeable === "unknown") {
    await new Promise((r) => setTimeout(r, 4000));
    const again = await githubApi(token, "GET", `/repos/${repo}/pulls/${number}`);
    // A different head since the first read is not the commit judged above.
    if (again.status === 200 && (again.json?.head as { sha?: string } | undefined)?.sha === head.sha) mergeable = again.json?.mergeable_state;
  }
  const kind = forwardingKind(project.hosted_rewrite_state) ?? "";
  const hostRuleOnly = kind === "vercel" || kind === "netlify";
  if (!hostRuleOnly && !CLEAN.has(String(mergeable ?? "unknown"))) {
    const openedAt = Date.parse(String(state.json.created_at ?? ""));
    const ageMs = Number.isFinite(openedAt) ? Date.now() - openedAt : Number.POSITIVE_INFINITY;
    // Not a failure: nothing is thrown or written, so the row keeps
    // "opened:<kind>" (mergedState needs the kind, and launch.ts does not
    // catch a throw) and the watch asks again on its next pass.
    if (ageMs < CHECKS_GRACE_MS) return;
    const { pullRequestChecks } = await import("@/lib/repo-publish");
    const ours = await pullRequestChecks(project, head.sha).catch(() => null);
    if (ours?.verdict === "pending" && ageMs < CHECKS_PENDING_MAX_MS) return;
    if (ours?.verdict === "failed") {
      const baseSha = (state.json.base as { sha?: string } | undefined)?.sha ?? "";
      const theirs = baseSha ? await pullRequestChecks(project, baseSha).catch(() => null) : null;
      const passedBefore = new Set(theirs?.passed ?? []);
      if (ours.failing.some((f) => passedBefore.has(f.name))) return;
    }
  }

  const merged = await githubApi(token, "PUT", `/repos/${repo}/pulls/${number}/merge`, { merge_method: "squash", sha: head.sha });
  if (merged.status !== 200) {
    const why = typeof merged.json?.message === "string" ? merged.json.message : `HTTP ${merged.status}`;
    throw new Error(`GitHub did not merge the forwarding pull request: ${why}`);
  }
  await db().from("projects").update({ hosted_rewrite_state: mergedState(project) }).eq("id", project.id);
}

/** "merged:<kind>", the kind carried over from "opened:<kind>"; plain
 *  "merged" when the row predates the kind (treated as unknown). */
function mergedState(project: Pick<Project, "hosted_rewrite_state">): string {
  // Already answered once ("live:<kind>"): that says more than "merged".
  if ((project.hosted_rewrite_state ?? "").startsWith("live:")) return project.hosted_rewrite_state as string;
  const kind = forwardingKind(project.hosted_rewrite_state);
  return kind ? `merged:${kind}` : "merged";
}

/** The plan kind recorded in hosted_rewrite_state, or null when unknown. */
export function forwardingKind(state: string | null | undefined): RewritePlan["kind"] | null {
  // "opened:<kind>", "merged:<kind>", "live:<kind>" (a Lovable site that has
  // answered once) and "merge-failed:<kind>: why". An older failure row,
  // "merge-failed: why", has no kind and reads as unknown.
  const m = (state ?? "").match(/^(?:opened|merged|live|merge-failed):([a-z-]+)(?::|$)/);
  return m ? (m[1] as RewritePlan["kind"]) : null;
}

/**
 * A merged forwarding change that the site still does not serve: when the
 * site turns out NOT to be on Vercel or Netlify and the merged change was a
 * host config file (or its kind is unknown), that file is inert there, so a
 * second pull request forwards inside the app instead. Returns true when
 * one was opened. In-app kinds are never re-planned: on those hosts only
 * the owner's deploy is missing.
 */
export async function replanForwarding(project: Project): Promise<boolean> {
  const kind = forwardingKind(project.hosted_rewrite_state);
  if (kind && kind !== "vercel" && kind !== "netlify") return false;
  const host = await detectSiteHost(project);
  if (host !== "other") return false;
  const pr = await openRewritePr(project, { blogEmpty: true, host, avoid: ["vercel", "netlify", "next-remove-blog"] });
  if (!pr) return false;
  if (project.auto_merge) {
    await mergeRewritePr({ ...project, hosted_rewrite_pr_url: pr.url, hosted_rewrite_state: `opened:${pr.kind}` }, pr.url).catch((e) => console.warn("[hosted] re-planned PR not merged:", e instanceof Error ? e.message : e));
  }
  return true;
}

/** Start (or leave running) the chain that watches for the site's /blog to
 *  answer from us (job-handlers/hosted-live.ts). Keyed per project and
 *  start, so a second call while a chain runs is a no-op. */
export async function startHostedLiveWatch(projectId: string): Promise<void> {
  const since = new Date().toISOString();
  await enqueue({ projectId, kind: "hosted-live", payload: { since, n: 0 }, idempotencyKey: `hosted-live:${projectId}:0` });
}

/** Does the site's own /blog answer with our marker yet? Stamps the time
 *  when it does. Cheap and bounded; called from the settings screen. */
export async function checkRewriteLive(project: Project): Promise<boolean> {
  const res = await fetchProjectUrl(hostedBase(project), project.domain, { timeoutMs: 5_000, userAgent: "DispatchSEO-Check/1.0" });
  const live = res?.headers.get(HOSTED_HEADER) === "1";
  if (!live) return false;
  const now = new Date().toISOString();
  if (!lovablePublishPending(project)) {
    await db().from("projects").update({ hosted_rewrite_live_at: now }).eq("id", project.id);
    return true;
  }
  // A Lovable site just went live: its owner pressed Publish. Whoever asked
  // (a page, the scheduler, the watch) only wanted the answer, so the two
  // things that waited for that click - the "your article is live" email and
  // Google's confirmation - are handed to the queue (hosted-live.ts). ONCE:
  // the write below only lands on a row that has never been live, so two
  // callers noticing the same click, or a caller holding an older copy of
  // the row, queue one finishing pass between them, and a site that answers
  // again after a blip (the row then says "live:lovable") queues none.
  const { data: first } = await db()
    .from("projects")
    .update({ hosted_rewrite_live_at: now, hosted_rewrite_state: "live:lovable" })
    .eq("id", project.id)
    .is("hosted_rewrite_live_at", null)
    .neq("hosted_rewrite_state", "live:lovable")
    .select("id");
  if (first?.length) {
    await enqueue({ projectId: project.id, kind: "hosted-live", payload: { finish: true }, idempotencyKey: `hosted-live:${project.id}:finish` }).catch(() => undefined);
  } else {
    // Not the first to see it (or the row moved on): just the stamp.
    await db().from("projects").update({ hosted_rewrite_live_at: now }).eq("id", project.id).is("hosted_rewrite_live_at", null);
  }
  return true;
}

/** The weekly re-probe (autopilot pass): a stamp older than a week is
 *  checked again, and CLEARED when the site's /blog no longer answers from
 *  us - an owner who removed the rewrite (or redeployed without it) must see
 *  the "Point your /blog at us" card again, and the scheduler must stop
 *  writing pages nobody can reach. A blip costs at most one day: the next
 *  pass finds no stamp and probes again through rewriteLiveCached. */
export async function reprobeRewriteWeekly(project: Project, now = new Date()): Promise<{ live: boolean } | null> {
  if (project.publish_target !== "hosted" || !project.hosted_rewrite_live_at) return null;
  if (now.getTime() - Date.parse(project.hosted_rewrite_live_at) < 7 * 24 * 3_600_000) return null;
  const live = await checkRewriteLive(project);
  if (!live) {
    await db().from("projects").update({ hosted_rewrite_live_at: null }).eq("id", project.id);
    project.hosted_rewrite_live_at = null;
  }
  return { live };
}

/** Settings reads the stamp and only re-probes when it is missing or old,
 *  so a page render never waits on a slow customer site every time. A
 *  probe that found nothing AND was slow (a site that hangs, times out at
 *  5 s, or answers nothing) is remembered for a minute on this instance:
 *  the owner still setting forwarding up is exactly the one reloading
 *  Settings, and each reload was a fresh 5-second wait before the page
 *  could render. A fast "no" is not remembered - it is cheap, and the owner
 *  who just fixed the rule sees it on their very next reload. */
const MISS_TTL_MS = 60_000;
const SLOW_MS = 1_500;
const slowMiss = new Map<string, number>();

export async function rewriteLiveCached(project: Project, maxAgeMs = 60 * 60_000): Promise<boolean> {
  const at = project.hosted_rewrite_live_at ? Date.parse(project.hosted_rewrite_live_at) : 0;
  if (at && Date.now() - at < maxAgeMs) return true;
  const missed = slowMiss.get(project.id);
  if (missed && Date.now() - missed < MISS_TTL_MS) return false;
  const started = Date.now();
  const live = await checkRewriteLive(project);
  if (live) slowMiss.delete(project.id);
  else if (Date.now() - started > SLOW_MS) slowMiss.set(project.id, started);
  return live;
}
