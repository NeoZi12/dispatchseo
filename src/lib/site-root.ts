import type { Project } from "@/lib/projects";

// The site's own address: its domain, plus the folder it lives in when it is
// not the root of that domain (migration 0085, projects.site_path).
//
// WHY. A GitHub Pages project site is served at https://<owner>.github.io/<repo>/
// and the root of that host is a different page or a 404. The first such
// signup (mohamadgarmabi.github.io/tanstack-fetch, 2026-11-10) had its crawl,
// its Google verification and its article addresses all aimed at that empty
// root, and stalled with nothing to show. Every "the site's own address" in
// the code goes through siteRoot(), so a site in a folder is read, verified
// and linked where it actually is.
//
// Client-safe: no server imports. resolveSitePath (the server half) lives in
// site-root-resolve.ts.

/** "/tanstack-fetch" or "" - the stored folder, cleaned. */
export function sitePath(project: { site_path?: string | null }): string {
  const raw = (project.site_path ?? "").trim();
  if (!raw) return "";
  const clean = `/${raw.replace(/^\/+|\/+$/g, "")}`;
  return clean === "/" ? "" : clean;
}

/** "https://host" + folder, no trailing slash. The origin learned from the
 *  homepage (hosted_origin: www or apex) wins over the bare domain. */
export function siteRoot(project: Pick<Project, "domain"> & { hosted_origin?: string | null; site_path?: string | null }): string {
  const origin = (project.hosted_origin || `https://${project.domain.replace(/^www\./, "")}`).replace(/\/+$/, "");
  return `${origin}${sitePath(project)}`;
}

/** The connected repo doesn't build the site (projects.repo_site_check, set
 *  by repo-site-check.ts): which repo, and whether it is simply empty. Null
 *  when it does, or was never checked. Client-safe - the dashboard card and
 *  Home's message read it. */
export type RepoMismatch = { repo: string; empty: boolean };
export function repoMismatchOf(project: { github_repo?: string | null; repo_site_check?: unknown }): RepoMismatch | null {
  const c = project.repo_site_check as { verdict?: string; repo?: string; empty?: boolean } | null | undefined;
  if (!c || c.verdict !== "mismatch" || !project.github_repo || c.repo !== project.github_repo) return null;
  return { repo: c.repo, empty: Boolean(c.empty) };
}

