import "server-only";
import type { Project } from "@/lib/projects";
import { effectiveAutomations, publishTarget, writerMode } from "@/lib/projects";
import { sitePath } from "@/lib/site-root";
import { hostedPath } from "@/lib/hosted-blog";
import { firstFreePath, onLovableHosting, planRepoRewrite, servesOwnBlog } from "@/lib/hosted-rewrite";

// Can we publish to this site on our own? Asked once, at the last setup step
// (after GitHub, before the stamp and the launch), so a site we cannot
// publish to is refused there instead of launching into a "paste this rule
// into your host" card (owner rule: setup refuses it, or it just works).
//
// A dry run of launch.ts launchBlog: the same decisions in the same order,
// reading only - no switch to the hosted blog, no pull request, no write.
//
//   folder site (sitePath)                     ok    (folderSiteFit owns it)
//   site serves its own blog + article folder  ok    repo
//   ... no folder, Auto, a ready store cached  ok    store
//   otherwise the hosted blog (/blog, or a second path for a site with its
//   own blog), planned the way openRewritePr plans it:
//     a plan we can open                       ok    hosted
//     manual                                   cant  hosted, reason below
//
// A Lovable project on Lovable's own hosting never takes a repo route: a
// commit there is not live until its owner presses Publish. On Lovable's
// current setup it gets the hosted blog through one route file (and one
// Publish click, asked for on the dashboard); on the older setup it is
// refused with the way to upgrade.
//
// A store that has never been scouted is NOT scouted here: the scout reads up
// to sixty repo files and makes one or two model calls (launch gives it a
// minute), which a page render cannot afford, and it caches its answer, which
// a dry run must not. So "no ready store cached" counts as no store.
//
// Anything that could not answer - GitHub unreadable, the site silent, a
// host we could not read, an exception, the time budget - is "unknown",
// which the caller treats as ok: a wrong refusal is worse than a retry.

export type PublishRouteReason =
  /** A repo with several apps and no way to tell which one is the site. */
  | "ambiguous-monorepo"
  /** A Next.js static export: no server to forward /blog from. */
  | "static-export"
  /** A Lovable project on Lovable's older setup. The one refusal the owner
   *  can clear: Lovable upgrades the project in place, and the check passes
   *  the next time they come back. */
  | "lovable-legacy"
  /** Any other host or setup we cannot write the forwarding rule for. */
  | "no-forwarding-rule";

/** `reason`: the machine-readable why - a PublishRouteReason when fit is
 *  "cant", otherwise a short note on how the answer was reached. */
export type PublishRouteCheck =
  | { fit: "cant"; route: "hosted"; reason: PublishRouteReason }
  | { fit: "ok" | "unknown"; route: "repo" | "store" | "hosted" | null; reason: string };

/** The whole check's budget. Every site fetch inside has its own timeout,
 *  but GitHub reads do not, and this runs inside a page render. */
const BUDGET_MS = 20_000;

/** A placeholder hosted key for planning: the plan's kind never depends on
 *  the key, and the dry run must not mint one. */
const DRY_KEY = "dry-run";

/** One answer per site and repo, kept for a minute on this instance: the
 *  check is a dozen GitHub reads and several fetches of the site, and both
 *  callers (the setup page, the get_setup_step tool) can be reloaded at
 *  will. Short enough that "I've upgraded it, check again" is never told
 *  the old answer for long; "unknown" is not kept at all. */
const KEEP_MS = 60_000;
const kept = new Map<string, { at: number; answer: PublishRouteCheck }>();

export async function checkPublishRoute(project: Project): Promise<PublishRouteCheck> {
  const key = `${project.id}:${project.github_repo ?? ""}`;
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.answer;
  const answer = await checkPublishRouteNow(project);
  if (answer.fit !== "unknown") {
    if (kept.size > 500) kept.clear();
    kept.set(key, { at: Date.now(), answer });
  }
  return answer;
}

async function checkPublishRouteNow(project: Project): Promise<PublishRouteCheck> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      decide(project),
      new Promise<PublishRouteCheck>((resolve) => {
        timer = setTimeout(() => resolve(unknown("out of time")), BUDGET_MS);
      }),
    ]);
  } catch (e) {
    return unknown(`check failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200));
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function unknown(reason: string): PublishRouteCheck {
  return { fit: "unknown", route: null, reason };
}

async function decide(project: Project): Promise<PublishRouteCheck> {
  if (!project.github_repo) return unknown("no repo connected");
  // The launch only runs for the hosted writer (job-handlers/launch.ts).
  if (writerMode(project) !== "hosted") return { fit: "ok", route: null, reason: "not the hosted writer" };
  if (sitePath(project)) return { fit: "ok", route: "repo", reason: "folder site" };
  if (project.hosted_rewrite_live_at) return { fit: "ok", route: "hosted", reason: "forwarding already live" };

  let path: string;
  if (publishTarget(project) === "hosted" && project.hosted_key) {
    // Flipped on an earlier attempt: launchBlog re-opens the pull request at
    // the path already chosen.
    path = hostedPath(project);
  } else {
    const own = await servesOwnBlog(project);
    // A Lovable-hosted site never takes a repo route (launchBlog): nothing
    // committed there goes live without the owner's Publish.
    if (own && !(await onLovableHosting(project).catch(() => false))) {
      const { repoHasArticleFolder } = await import("@/lib/repo-publish");
      const folder = await repoHasArticleFolder(project).catch(() => null);
      if (folder !== false) return { fit: "ok", route: "repo", reason: folder === null ? "article folder not checked" : "article folder" };
      if (effectiveAutomations(project).auto_merge) {
        const { readBlogStore } = await import("@/lib/blog-store");
        const store = await readBlogStore(project.id).catch(() => null);
        if (store?.status === "ready") return { fit: "ok", route: "store", reason: "blog store ready" };
        // Never scouted: the launch will look (blog-store.ts), and a blog
        // kept as data may well take our articles. Not ours to refuse.
        if (!store) return unknown("blog store not scouted yet");
      }
    }
    // switchToHostedBlog's path: one chosen before is kept; a site with its
    // own blog gets the first free second path.
    const kept = project.hosted_path && hostedPath(project) !== "blog" ? hostedPath(project) : null;
    if (kept) path = kept;
    else if (own) {
      const free = await firstFreePath(project);
      // firstFreePath folds "taken" and "did not answer" into one null, so
      // this is not a definite answer.
      if (!free) return unknown("no free second path");
      path = free;
    } else path = "blog";
  }

  // /blog is passed as "no path chosen yet", the way the launch has it: only
  // then does the planner move a site whose app already has a /blog page to
  // a free second path, instead of answering "manual".
  const planning = await planRepoRewrite({ ...project, hosted_path: path === "blog" ? null : path }, project.hosted_key ?? DRY_KEY, { blogEmpty: true });
  if (!planning) return unknown("GitHub could not be read");
  if (planning.plan.kind !== "manual") return { fit: "ok", route: "hosted", reason: planning.plan.kind };
  // Manual, but only definite when the plan rests on a full read: a tree
  // GitHub cut short, a file it did not return, or a host that did not answer
  // (a Netlify site with no Netlify file in the repo is only seen on the
  // wire) could each turn it into a rule we can write.
  if (!planning.treeOk || planning.readFailed) return unknown("repo not fully read");
  if (planning.ambiguous) return { fit: "cant", route: "hosted", reason: "ambiguous-monorepo" };
  if (planning.host === "unknown" || planning.host === null) return unknown("site host not read");
  if (planning.plan.why === "lovable-legacy") return { fit: "cant", route: "hosted", reason: "lovable-legacy" };
  // A GitHub Pages address with no folder on the row: either a user site at
  // the root, or a project site whose folder could not be worked out just
  // now (the launch tries again). Not known well enough to refuse.
  if (/\.github\.io$/i.test(project.domain ?? "")) return unknown("GitHub Pages site, folder not resolved");
  if (/\boutput\s*:\s*["'`]export["'`]/.test(planning.files?.nextConfig?.content ?? "")) return { fit: "cant", route: "hosted", reason: "static-export" };
  return { fit: "cant", route: "hosted", reason: "no-forwarding-rule" };
}
