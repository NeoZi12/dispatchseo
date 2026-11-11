import "server-only";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { fetchProjectUrl } from "@/lib/url-guard";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { repoMismatchOf, siteRoot } from "@/lib/site-root";

// Does the connected repository build this site?
//
// WHY. Setup lets the owner connect any repository the GitHub App can see,
// and nothing checked that it is the site's own. reverto.ai (2026-11-10)
// connected a repository named "DispatchSEO" - possibly a copy of this very
// codebase - and every article would have been opened as a pull request into
// a repo that never reaches the site: written, paid for, merged, never live.
//
// THE TEST. A site's homepage names the static files it serves (its images,
// icons, fonts); a repository that builds the site holds them, at the same
// relative path under whatever folder serves them (public/, static/, the
// root). Measured on real pairs: dispatchseo.com vs its repo 5/5,
// clockedcode.com 8/9, tanstack-fetch 2/2; reverto.ai vs the DispatchSEO
// repo 0/39. Generic names every project has (favicon.ico, robots.txt) are
// not evidence and are left out; hashed build outputs are never committed.
//
// Only a clear miss is a "mismatch": enough named files and almost none in
// the repo. Everything uncertain is "unknown" and never blocks anything.

export type RepoSiteCheck = {
  verdict: "match" | "mismatch" | "unknown";
  repo: string;
  /** The repo has no commits at all (reverto.ai's "DispatchSEO" repo): it
   *  cannot be the site's code, whatever the homepage names. */
  empty?: boolean;
  named: number;
  found: number;
  at: string;
};

const STATIC = /\.(png|jpe?g|gif|svg|webp|avif|ico|webmanifest|txt|woff2?|mp4|webm|pdf)$/i;
const HASHED = /[.-][A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpe?g|svg|webp|avif)$/;
const GENERIC = new Set([
  "favicon.ico", "favicon.svg", "favicon.png", "icon.png", "icon.svg", "apple-icon.png", "apple-touch-icon.png",
  "opengraph-image.png", "twitter-image.png", "og.png", "og-image.png", "manifest.webmanifest", "site.webmanifest",
  "manifest.json", "robots.txt", "sitemap.xml", "logo.png", "logo.svg", "llms.txt",
]);
const MIN_NAMED = 3;
const MISMATCH_BELOW = 0.15;
const MATCH_FROM = 0.5;

/** The static files the homepage names, relative to the site's root. */
export function namedStaticFiles(html: string, rootUrl: URL): string[] {
  const rootPath = rootUrl.pathname.endsWith("/") ? rootUrl.pathname : `${rootUrl.pathname}/`;
  const rels = new Set<string>();
  for (const m of html.slice(0, 400_000).matchAll(/\b(?:src|href|srcset|content)\s*=\s*["']([^"'#\s]+)/gi)) {
    let u: URL;
    try {
      // A Next.js site serves every <Image> through its optimizer
      // (/_next/image?url=%2Fimages%2Fx.webp), so the homepage names its
      // files only inside that query. Unwrapped, they are the evidence;
      // skipped as "_next/", neozino.dev (2026-11-10) named none and the
      // wrong repo it connected was never caught.
      const raw = m[1].replace(/&amp;/g, "&");
      const opt = /\/_(?:next|vercel)\/image\?(?:[^&]*&)*?url=([^&]+)/i.exec(raw);
      u = new URL((opt ? decodeURIComponent(opt[1]) : raw).split(/[?,\s]/)[0], rootUrl);
    } catch {
      continue;
    }
    if (u.host !== rootUrl.host || !u.pathname.startsWith(rootPath)) continue;
    let rel: string;
    try {
      rel = decodeURIComponent(u.pathname.slice(rootPath.length));
    } catch {
      continue;
    }
    if (!rel || !STATIC.test(rel) || HASHED.test(rel) || rel.startsWith("_next/") || rel.startsWith("assets/")) continue;
    if (GENERIC.has(rel.toLowerCase())) continue;
    rels.add(rel);
  }
  return [...rels];
}

/** The verdict from the two lists. Pure, so it can be tested on its own. */
export function judgeRepoSite(named: string[], repoPaths: string[]): Pick<RepoSiteCheck, "verdict" | "named" | "found"> {
  const found = named.filter((rel) => repoPaths.some((p) => p === rel || p.endsWith(`/${rel}`))).length;
  if (named.length < MIN_NAMED) return { verdict: "unknown", named: named.length, found };
  const share = found / named.length;
  return { verdict: share < MISMATCH_BELOW ? "mismatch" : share >= MATCH_FROM ? "match" : "unknown", named: named.length, found };
}

/**
 * Check, store on the project (projects.repo_site_check) and return. A
 * stored answer for the same repo from the last day is reused. Never
 * throws: anything it can't read is "unknown".
 */
export async function checkRepoBuildsSite(project: Project, opts: { fresh?: boolean } = {}): Promise<RepoSiteCheck> {
  const repo = project.github_repo ?? "";
  const unknown = (): RepoSiteCheck => ({ verdict: "unknown", repo, named: 0, found: 0, at: new Date().toISOString() });
  if (!repo || !project.domain) return unknown();
  const stored = project.repo_site_check as RepoSiteCheck | null | undefined;
  if (!opts.fresh && stored && stored.repo === repo && Date.now() - Date.parse(stored.at) < 86_400_000) return stored;
  try {
    const root = new URL(`${siteRoot(project)}/`);
    const host = project.domain.replace(/^www\./, "");
    const [home, token] = await Promise.all([
      fetchProjectUrl(root.toString(), host, { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" }),
      tokenForRef(project),
    ]);
    if (!home || !home.ok || !token) return unknown();
    const named = namedStaticFiles(await home.text(), new URL(home.url || root.toString()));
    const listing = await repoPaths(token, repo);
    if (!listing) return unknown();
    let result: RepoSiteCheck;
    if (listing.empty) {
      result = { verdict: "mismatch", repo, empty: true, named: named.length, found: 0, at: new Date().toISOString() };
    } else {
      if (named.length < MIN_NAMED) return unknown();
      // A truncated listing could miss the served folder: never call that a miss.
      const judged = judgeRepoSite(named, listing.paths);
      result = { ...judged, verdict: listing.truncated && judged.verdict === "mismatch" ? "unknown" : judged.verdict, repo, at: new Date().toISOString() };
    }
    await db().from("projects").update({ repo_site_check: result }).eq("id", project.id);
    console.log(`[repo-site] ${project.slug}: ${repo} ${result.verdict} (${result.found}/${result.named} of the homepage's files)`);
    return result;
  } catch (e) {
    console.warn(`[repo-site] ${project.slug}: not checked: ${e instanceof Error ? e.message : String(e)}`);
    return unknown();
  }
}

/** Every file path on the repo's default branch; empty = no commits yet
 *  (GitHub answers 409 "Git Repository is empty"). Null when unreadable. */
async function repoPaths(token: string, repo: string): Promise<{ paths: string[]; empty: boolean; truncated: boolean } | null> {
  const info = await githubApi(token, "GET", `/repos/${repo}`);
  if (info.status !== 200) return null;
  const branch = String(info.json?.default_branch ?? "");
  // Not GitHub's `size`: it is only recalculated about hourly and reads 0
  // for a repo that was created and pushed minutes ago, which is exactly
  // when a new owner connects it - their site's repo was then judged empty
  // and refused as the wrong one. The tree below says what is really there
  // (409 = no commits yet).
  if (!branch) return { paths: [], empty: true, truncated: false };
  const tree = await githubApi(token, "GET", `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  if (tree.status === 409) return { paths: [], empty: true, truncated: false };
  if (tree.status !== 200) return null;
  const paths = ((tree.json?.tree as { path?: string; type?: string }[] | undefined) ?? []).filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));
  return { paths, empty: paths.length === 0, truncated: tree.json?.truncated === true };
}

/**
 * The connected repo doesn't build the site: look through the other repos
 * the owner gave the GitHub App, and when exactly ONE of them builds the site
 * (its files are the homepage's), connect that one instead - the owner
 * picked the wrong repo, or created an empty one for us, and the right one
 * is already shared. Returns the project re-pointed at it, or null when no
 * single repo is clearly the site (then the caller says so instead).
 */
export async function findSiteRepo(project: Project): Promise<Project | null> {
  if (!project.github_installation_id || !project.domain) return null;
  try {
    const { listInstallationRepos } = await import("@/lib/github-app");
    // Never a repository another site is built from: with one installation
    // shared between an owner's sites, a second site started from a copy of
    // the first one's code "matched" the first site's repo, and its articles
    // would have been merged there.
    const { data: bound } = await db().from("projects").select("github_repo").not("github_repo", "is", null).neq("id", project.id);
    const taken = new Set(((bound ?? []) as { github_repo: string | null }[]).map((r) => r.github_repo).filter(Boolean) as string[]);
    const repos = (await listInstallationRepos(project.github_installation_id)).map((r) => r.full_name).filter((r) => r !== project.github_repo && !taken.has(r)).slice(0, 15);
    if (!repos.length) return null;
    const root = new URL(`${siteRoot(project)}/`);
    const host = project.domain.replace(/^www\./, "");
    const [home, token] = await Promise.all([fetchProjectUrl(root.toString(), host, { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" }), tokenForRef(project)]);
    if (!home || !home.ok || !token) return null;
    const named = namedStaticFiles(await home.text(), new URL(home.url || root.toString()));
    if (named.length < MIN_NAMED) return null;
    const matches: { repo: string; check: RepoSiteCheck }[] = [];
    for (const repo of repos) {
      const listing = await repoPaths(token, repo).catch(() => null);
      if (!listing || listing.empty) continue;
      const judged = judgeRepoSite(named, listing.paths);
      if (judged.verdict === "match") matches.push({ repo, check: { ...judged, repo, at: new Date().toISOString() } });
    }
    if (matches.length !== 1) return null;
    const [{ repo, check }] = matches;
    // The folder hint and the blog-switch PR belonged to the old repo.
    const { error } = await db().from("projects").update({ github_repo: repo, repo_site_check: check, content_path_hint: null, hosted_rewrite_pr_url: null, hosted_rewrite_live_at: null }).eq("id", project.id).eq("github_repo", project.github_repo ?? "");
    if (error) return null;
    console.log(`[repo-site] ${project.slug}: ${project.github_repo} is not the site; switched to ${repo} (${check.found}/${check.named})`);
    // Articles held for the wrong repo go out now, not at the hourly drain.
    const { data: parked } = await db().from("article_drafts").select("id").eq("project_id", project.id).eq("status", "blocked_setup");
    const { enqueue } = await import("@/lib/jobs");
    for (const d of (parked ?? []) as { id: string }[]) {
      await enqueue({ projectId: project.id, kind: "publish", payload: { draftId: d.id }, idempotencyKey: `publish:${d.id}` }).catch(() => null);
    }
    return { ...project, github_repo: repo, repo_site_check: check, content_path_hint: null };
  } catch (e) {
    console.warn(`[repo-site] ${project.slug}: other repos not searched: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** True when the stored check says the connected repo does not build the site. */
export function repoIsNotTheSite(project: Pick<Project, "github_repo"> & { repo_site_check?: unknown }): boolean {
  return repoMismatchOf(project) !== null;
}

/**
 * The owner changed which repos the App can see (they came back from
 * GitHub's picker, or GitHub sent installation_repositories): every project
 * on that installation whose connected repo is the wrong one gets the right
 * one now, if exactly one of the shared repos builds its site. Best effort;
 * the hourly drain of held articles does the same search anyway.
 */
export async function healReposForInstallation(installationId: number): Promise<number> {
  const { getProjectById } = await import("@/lib/projects");
  const { data } = await db().from("projects").select("id").eq("github_installation_id", installationId);
  let switched = 0;
  for (const { id } of (data ?? []) as { id: string }[]) {
    const project = await getProjectById(id).catch(() => null);
    if (!project?.github_repo || !repoIsNotTheSite(project)) continue;
    if (await findSiteRepo(project)) switched++;
  }
  return switched;
}

