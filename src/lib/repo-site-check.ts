import "server-only";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { fetchProjectUrl } from "@/lib/url-guard";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { siteRoot } from "@/lib/site-root";

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
      u = new URL(m[1].split(/[?,\s]/)[0], rootUrl);
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
    if (named.length < MIN_NAMED) return unknown();
    const info = await githubApi(token, "GET", `/repos/${repo}`);
    const branch = String(info.json?.default_branch ?? "");
    if (info.status !== 200 || !branch) return unknown();
    const tree = await githubApi(token, "GET", `/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const paths = ((tree.json?.tree as { path?: string; type?: string }[] | undefined) ?? []).filter((e) => e.type === "blob").map((e) => String(e.path ?? ""));
    if (tree.status !== 200 || !paths.length) return unknown();
    // A truncated listing could miss the served folder: never call that a miss.
    const judged = judgeRepoSite(named, paths);
    const result: RepoSiteCheck = { ...judged, verdict: tree.json?.truncated === true && judged.verdict === "mismatch" ? "unknown" : judged.verdict, repo, at: new Date().toISOString() };
    await db().from("projects").update({ repo_site_check: result }).eq("id", project.id);
    console.log(`[repo-site] ${project.slug}: ${repo} ${result.verdict} (${result.found}/${result.named} of the homepage's files)`);
    return result;
  } catch (e) {
    console.warn(`[repo-site] ${project.slug}: not checked: ${e instanceof Error ? e.message : String(e)}`);
    return unknown();
  }
}

/** True when the stored check says the connected repo does not build the site. */
export function repoIsNotTheSite(project: Pick<Project, "github_repo"> & { repo_site_check?: unknown }): boolean {
  const c = project.repo_site_check as RepoSiteCheck | null | undefined;
  return Boolean(c && c.verdict === "mismatch" && c.repo === project.github_repo);
}
