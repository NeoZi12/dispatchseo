import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
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
  | { kind: "vercel" | "netlify" | "next-proxy" | "next-config" | "next-remove-blog"; files: PlanFile[] }
  | { kind: "manual" };

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
  if (has("vercel.json") && host !== "other") {
    const plan = vercelPlan();
    if (plan) return plan;
  }
  return { kind: "manual" };
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
export async function switchToHostedBlog(project: Project, opts: { secondPath?: boolean } = {}): Promise<Project | null> {
  // A site that already serves a /blog (a CMS-backed one the repo scan could
  // not see, or anything else) must not have it forwarded away from under
  // it. "No markdown folder" is not "no blog".
  //
  // A path chosen on an earlier attempt is kept as it is: once our rule is
  // live it answers with our marker, and re-deciding would only flip-flop.
  let path: string | null = project.hosted_path && hostedPath(project) !== "blog" ? hostedPath(project) : null;
  if (!path && (await servesOwnBlog(project))) {
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
    if (pr) updated.hosted_rewrite_pr_url = pr.url;
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
 *  ours? 404 or our own marker = free. Unreachable = free on cloud (a new
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
  const origin = siteOrigin(project);
  const init = { timeoutMs: 6_000, userAgent: "DispatchSEO-Check/1.0" };
  const res = await fetchProjectUrl(`${origin}/blog`, project.domain, init);
  if (!res) return !isCloudMode();
  if (res.headers.get(HOSTED_HEADER) === "1") return false;
  if (res.status !== 200) return false;
  const body = await res.text().catch(() => "");
  const probe = await fetchProjectUrl(`${origin}/dispatchseo-probe-${randomBytes(6).toString("hex")}`, project.domain, init);
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
  const origin = siteOrigin(project);
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

export async function openRewritePr(project: Project, opts: PlanOptions = {}): Promise<{ url: string; merged: boolean; kind: RewritePlan["kind"] } | null> {
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
  const paths = ((treeRes.json?.tree as { path?: string; type?: string }[] | undefined) ?? []).filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));

  // The deployed app's own directory (a monorepo's apps/<x>), with paths
  // made relative to it so planRewrite reasons about that app alone.
  const app = siteAppRoot(paths);
  const prefix = app.root ? `${app.root}/` : "";
  const appPaths = prefix ? paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)) : paths;
  const read = async (rel: string): Promise<string | null> => {
    const path = `${prefix}${rel}`;
    if (!paths.includes(path)) return null;
    const res = await githubApi(token, "GET", `/repos/${repo}/contents/${encodeURI(path)}?ref=${encodeURIComponent(baseBranch)}`);
    const content = res.json?.content;
    return typeof content === "string" ? Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8") : null;
  };
  if (!project.hosted_key) return null;
  let planned: RewritePlan = { kind: "manual" };
  if (!app.ambiguous) {
    const host = opts.host ?? (await detectSiteHost(project));
    const nextConfigPath = appPaths.find((p) => /^next\.config\.(js|mjs|ts|cjs)$/.test(p)) ?? null;
    const nextConfigText = nextConfigPath ? await read(nextConfigPath) : null;
    planned = planRewrite(
      appPaths,
      {
        vercelJson: await read("vercel.json"),
        redirects: (await read("public/_redirects")) ?? (await read("_redirects")),
        nextConfig: nextConfigPath && nextConfigText ? { path: nextConfigPath, content: nextConfigText } : null,
        packageJson: await read("package.json"),
      },
      backend,
      project.hosted_key,
      { blogEmpty: Boolean(opts.blogEmpty), host, avoid: opts.avoid, path: hostedPath(project) },
    );
  }
  if (planned.kind === "manual") {
    await db().from("projects").update({ hosted_rewrite_pr_url: "manual", hosted_rewrite_state: "manual" }).eq("id", project.id);
    return null;
  }
  const plan = planned;
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
    `Merge it and your articles are live at ${base} within a few minutes of the deploy. Nothing else in your site changes` +
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
  await db().from("projects").update({ hosted_rewrite_pr_url: url, hosted_rewrite_state: `opened:${plan.kind}` }).eq("id", project.id);
  return { url, merged: false, kind: plan.kind };
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
 *  protection, a conflict) throws and leaves the PR open. */
export async function mergeRewritePr(project: Project, prUrl: string): Promise<void> {
  try {
    await mergeRewritePrNow(project, prUrl);
  } catch (e) {
    const why = (e instanceof Error ? e.message : String(e)).slice(0, 200);
    await db().from("projects").update({ hosted_rewrite_state: `merge-failed: ${why}` }).eq("id", project.id);
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
  const kind = forwardingKind(project.hosted_rewrite_state);
  return kind ? `merged:${kind}` : "merged";
}

/** The plan kind recorded in hosted_rewrite_state, or null when unknown. */
export function forwardingKind(state: string | null | undefined): RewritePlan["kind"] | null {
  const m = (state ?? "").match(/^(?:opened|merged):([a-z-]+)$/);
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
  if (live) await db().from("projects").update({ hosted_rewrite_live_at: new Date().toISOString() }).eq("id", project.id);
  return live;
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
