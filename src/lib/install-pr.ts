import { tokenForRef } from "@/lib/github";
import { INSTALL_BRANCH } from "@/lib/pipeline-install";

// The open install PR for a project's repo, so setup surfaces can say "your
// move: merge this" with a link instead of waiting silently.
//
// Shared by the legacy wizard's status poll (/api/onboarding/status) and the
// setup path's step loader (setup-path.ts). It lives here, not in either
// route, because Next refuses non-handler exports from a route file [R17].
//
// "The install PR" is exactly the PR whose head is the install branch
// (pipeline-install.ts's INSTALL_BRANCH), looked up with GitHub's own `head`
// filter. It used to be "the first open PR labelled seo", which is a CONTENT
// PR on any repo already building articles - the step then told the owner to
// merge a guide and called it the install.
//
// Cached 60s per INSTALLATION + REPO in a module Map (per-lambda,
// best-effort, gone with the instance - same shape as install-reconcile.ts's
// lastAttempt). Keyed on the installation too: github_repo is a free-text
// column, so a second tenant naming the same repo must never be answered
// from the first tenant's credentialed read. Both pollers run every few
// seconds and GitHub's rate limit is per installation, so this is the bound
// that holds.
const prCache = new Map<string, { at: number; pr: { url: string; title: string } | null }>();
const TTL_MS = 60_000;

/** `null` = looked, no open install PR. `undefined` = unknown (no token,
 *  GitHub error, timeout) - callers fall back to their own hint and must
 *  never read it as "merged". Errors are not cached. */
export async function openInstallPr(project: {
  github_repo: string | null;
  github_installation_id?: number | null;
  slug?: string | null;
}): Promise<{ url: string; title: string } | null | undefined> {
  const repo = project.github_repo;
  if (!repo) return null;
  const key = `${project.github_installation_id ?? "instance"}:${repo}`;
  const hit = prCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.pr;

  let pr: { url: string; title: string } | null;
  try {
    const token = await tokenForRef(project);
    if (!token) return undefined;
    const owner = repo.split("/")[0];
    const head = encodeURIComponent(`${owner}:${INSTALL_BRANCH}`);
    const res = await fetch(`https://api.github.com/repos/${repo}/pulls?state=open&head=${head}&per_page=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "dispatchseo-app",
      },
      // The caller is waiting for the PR to appear or disappear; this cache
      // alone bounds it to one call per minute per installation + repo.
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return undefined;
    const list = (await res.json()) as Array<{ html_url?: string; title?: string }>;
    const first = Array.isArray(list) ? list[0] : undefined;
    pr = first?.html_url ? { url: first.html_url, title: first.title ?? "Install the DispatchSEO content pipeline" } : null;
  } catch {
    return undefined;
  }
  if (prCache.size > 500) {
    for (const [k, v] of prCache) if (Date.now() - v.at >= TTL_MS) prCache.delete(k);
  }
  prCache.set(key, { at: Date.now(), pr });
  return pr;
}
