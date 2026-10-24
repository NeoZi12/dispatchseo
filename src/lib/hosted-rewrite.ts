import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { HOSTED_HEADER, siteOrigin } from "@/lib/hosted-blog";
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

export function manualSnippet(backend: string, slug: string): { vercel: string; netlify: string; next: string } {
  const dest = rewriteDestination(backend, slug);
  return {
    vercel: JSON.stringify({ rewrites: [{ source: "/blog", destination: dest }, { source: "/blog/:path*", destination: `${dest}/:path*` }] }, null, 2),
    netlify: `/blog  ${dest}  200\n/blog/*  ${dest}/:splat  200\n`,
    next: `// next.config.js\nasync rewrites() {\n  return [\n    { source: "/blog", destination: "${dest}" },\n    { source: "/blog/:path*", destination: "${dest}/:path*" },\n  ];\n}`,
  };
}

/** Merge our two rewrites into an existing vercel.json without disturbing
 *  anything else in it. Idempotent. */
export function withVercelRewrites(existing: string | null, backend: string, slug: string): string | null {
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
  const ours = [
    { source: "/blog", destination: dest },
    { source: "/blog/:path*", destination: `${dest}/:path*` },
  ];
  const current = Array.isArray(json.rewrites) ? (json.rewrites as { source?: string }[]) : [];
  const kept = current.filter((r) => r.source !== "/blog" && r.source !== "/blog/:path*");
  json.rewrites = [...ours, ...kept];
  return JSON.stringify(json, null, 2) + "\n";
}

export function withNetlifyRedirects(existing: string | null, backend: string, slug: string): string {
  const dest = rewriteDestination(backend, slug);
  const lines = (existing ?? "").split("\n").filter((l) => !/^\/blog(\/\*)?\s/.test(l.trim()));
  const body = lines.join("\n").replace(/\n*$/, "");
  return `${body ? body + "\n" : ""}/blog  ${dest}  200\n/blog/*  ${dest}/:splat  200\n`;
}

export type RewritePlan =
  | { kind: "vercel"; path: string; content: string }
  | { kind: "netlify"; path: string; content: string }
  | { kind: "manual" };

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

/** Decide the file from the repo's root listing (and a public/ dir). */
export function planRewrite(paths: string[], existing: { vercelJson: string | null; redirects: string | null }, backend: string, slug: string): RewritePlan {
  const has = (p: string) => paths.includes(p);
  const isNext = paths.some((p) => /^next\.config\.(js|mjs|ts|cjs)$/.test(p));
  // Netlify evidence wins over the Next.js guess: a Next app deployed on
  // Netlify ignores vercel.json entirely.
  const onNetlify = has("netlify.toml") || has("public/_redirects") || has("_redirects");
  if (!onNetlify && (has("vercel.json") || isNext)) {
    const content = withVercelRewrites(existing.vercelJson, backend, slug);
    return content ? { kind: "vercel", path: "vercel.json", content } : { kind: "manual" };
  }
  if (onNetlify) {
    const path = has("public/_redirects") ? "public/_redirects" : has("_redirects") ? "_redirects" : paths.some((p) => p.startsWith("public/")) ? "public/_redirects" : "_redirects";
    return { kind: "netlify", path, content: withNetlifyRedirects(existing.redirects, backend, slug) };
  }
  return { kind: "manual" };
}

/**
 * Flip the project to the hosted route and open the rewrite pull request.
 * Returns the updated project, or null only when the flip itself failed
 * (the PR is best effort and its absence is recorded, not thrown).
 */
export async function switchToHostedBlog(project: Project): Promise<Project | null> {
  // A site that already serves a /blog (a CMS-backed one the repo scan could
  // not see, or anything else) must not have it forwarded away from under
  // it. "No markdown folder" is not "no blog".
  if (await servesOwnBlog(project)) return null;

  const key = project.hosted_key ?? mintHostedKey();
  const { data, error } = await db()
    .from("projects")
    .update({ publish_target: "hosted", hosted_key: key })
    .eq("id", project.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  const updated: Project = { ...project, publish_target: "hosted", hosted_key: key };
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
    const pr = await openRewritePr(updated);
    if (pr) updated.hosted_rewrite_pr_url = pr.url;
  } catch (e) {
    console.warn("[hosted] rewrite PR not opened:", e instanceof Error ? e.message : e);
  }
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

/** Exported for testing: the blog-index shape servesOwnBlog requires. */
export function looksLikeBlogIndex(html: string): boolean {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  if (/\bblog\b/i.test(title)) return true;
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"']*\/blog\/[^"'#?]+)["']/gi)) links.add(m[1].replace(/\/+$/, ""));
  return links.size >= 3;
}

export async function openRewritePr(project: Project): Promise<{ url: string; merged: boolean; kind: RewritePlan["kind"] } | null> {
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
  const planned = app.ambiguous
    ? ({ kind: "manual" } as const)
    : planRewrite(appPaths, { vercelJson: await read("vercel.json"), redirects: (await read("public/_redirects")) ?? (await read("_redirects")) }, backend, project.hosted_key);
  const plan: RewritePlan = planned.kind === "manual" ? planned : { ...planned, path: `${prefix}${planned.path}` };
  if (plan.kind === "manual") {
    await db().from("projects").update({ hosted_rewrite_pr_url: "manual" }).eq("id", project.id);
    return null;
  }

  const created = await githubApi(token, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${BRANCH}`, sha: headSha });
  if (created.status === 422) {
    await githubApi(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${BRANCH}`)}`, { sha: headSha, force: true });
  } else if (created.status !== 201) return null;
  const tree = await githubApi(token, "POST", `/repos/${repo}/git/trees`, { base_tree: baseTree, tree: [{ path: plan.path, mode: "100644", type: "blob", content: plan.content }] });
  if (!tree.json?.sha) return null;
  const commit = await githubApi(token, "POST", `/repos/${repo}/git/commits`, {
    message: "Forward /blog to the DispatchSEO hosted blog\n\nOne rewrite: your site's /blog is served by DispatchSEO under your own domain.",
    tree: String(tree.json.sha),
    parents: [headSha],
  });
  if (!commit.json?.sha) return null;
  await githubApi(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${BRANCH}`)}`, { sha: String(commit.json.sha), force: true });

  const origin = siteOrigin(project);
  const body =
    `This adds one forwarding rule: \`${origin}/blog\` and everything under it is served by DispatchSEO, under your domain, with your site name and a link back to your site.\n\n` +
    `Merge it and your blog is live at ${origin}/blog within a few minutes of the deploy. Nothing else in your site changes. ` +
    `If your site is not deployed on ${plan.kind === "vercel" ? "Vercel" : "Netlify"}, the same rule for your host is on your DispatchSEO settings screen.`;
  let prNumber: number | null = null;
  let url = "";
  const pr = await githubApi(token, "POST", `/repos/${repo}/pulls`, { title: "Forward /blog to your hosted blog", head: BRANCH, base: baseBranch, body });
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

  // Never auto-merged, whatever the automation mode: this changes the
  // site's routing, and that merge is the owner's.
  await db().from("projects").update({ hosted_rewrite_pr_url: url }).eq("id", project.id);
  return { url, merged: false, kind: plan.kind };
}

/** Does the site's own /blog answer with our marker yet? Stamps the time
 *  when it does. Cheap and bounded; called from the settings screen. */
export async function checkRewriteLive(project: Project): Promise<boolean> {
  const res = await fetchProjectUrl(`${siteOrigin(project)}/blog`, project.domain, { timeoutMs: 5_000, userAgent: "DispatchSEO-Check/1.0" });
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
 *  so a page render never waits on a slow customer site every time. */
export async function rewriteLiveCached(project: Project, maxAgeMs = 60 * 60_000): Promise<boolean> {
  const at = project.hosted_rewrite_live_at ? Date.parse(project.hosted_rewrite_live_at) : 0;
  if (at && Date.now() - at < maxAgeMs) return true;
  return checkRewriteLive(project);
}
