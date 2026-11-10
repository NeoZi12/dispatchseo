import "server-only";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import { fetchProjectUrl } from "@/lib/url-guard";
import { tokenForRef } from "@/lib/github";
import { githubApi } from "@/lib/repo-publish";
import { sitePath } from "@/lib/site-root";

const INIT = { timeoutMs: 8_000, userAgent: "DispatchSEO-Check/1.0" };

async function answers(url: string, host: string): Promise<boolean> {
  const res = await fetchProjectUrl(url, host, INIT).catch(() => null);
  return Boolean(res && res.status >= 200 && res.status < 300);
}

/**
 * Where on its host this project's site actually is, once the repo is known,
 * and stored when it is a folder. Called by the launch job before anything
 * reads the site, so a GitHub Pages project site is never crawled, verified
 * or linked at the empty root of <owner>.github.io.
 *
 * Two pieces of evidence, both checked against the live site before they
 * are believed:
 *  1. GitHub Pages' own rule: a repo named anything but "<owner>.github.io"
 *     is served at https://<owner>.github.io/<repo>/.
 *  2. The repo's "Website" field (homepage) on the same host with a path,
 *     used only when the domain's root does not answer - a working root is
 *     never moved into a folder on a hint.
 * Returns the project with site_path filled when one was found.
 */
export async function resolveSitePath(project: Project): Promise<Project> {
  if (sitePath(project) || !project.domain || !project.github_repo) return project;
  const host = project.domain.toLowerCase().replace(/^www\./, "");
  const [owner, name] = project.github_repo.split("/");
  if (!owner || !name) return project;

  // A working root is never moved into a folder: a user site at
  // <owner>.github.io built from a repo named "blog" also answers at /blog/,
  // and that is a section of the site, not the site.
  if (await answers(`https://${host}/`, host)) return project;

  const folderOf = (url: string): string | null => {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/index\.html?$/i, "").replace(/\/+$/, "");
      return u.hostname.replace(/^www\./, "") === host && /^(\/[A-Za-z0-9._~-]+){1,4}$/.test(path) ? path : null;
    } catch {
      return null;
    }
  };
  const candidates: string[] = [];
  const token = await tokenForRef(project).catch(() => null);
  if (token) {
    // GitHub's own answer first (needs the App's Pages permission; a refusal
    // just falls through), then the repo's Website field.
    const pages = await githubApi(token, "GET", `/repos/${project.github_repo}/pages`).catch(() => null);
    if (pages?.status === 200 && typeof pages.json?.html_url === "string") {
      const p = folderOf(pages.json.html_url);
      if (p) candidates.push(p);
    }
    const info = await githubApi(token, "GET", `/repos/${project.github_repo}`).catch(() => null);
    if (typeof info?.json?.homepage === "string") {
      const p = folderOf(info.json.homepage);
      if (p) candidates.push(p);
    }
  }
  // GitHub Pages' naming rule: a repo not named "<owner>.github.io" is served
  // at /<repo>/.
  if (host === `${owner.toLowerCase()}.github.io` && name.toLowerCase() !== host) candidates.push(`/${name}`);

  let found: string | null = null;
  for (const c of [...new Set(candidates)]) {
    if (await answers(`https://${host}${c}/`, host)) {
      found = c;
      break;
    }
  }
  if (!found) return project;
  const { error } = await db().from("projects").update({ site_path: found }).eq("id", project.id).is("site_path", null);
  if (error) {
    console.warn(`[site-root] ${project.slug}: folder ${found} not stored: ${error.message}`);
    return project;
  }
  console.log(`[site-root] ${project.slug}: the site lives at ${host}${found}`);
  return { ...project, site_path: found };
}
