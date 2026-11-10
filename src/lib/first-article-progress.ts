import { repoIsNotTheSite } from "@/lib/repo-site-check";
import { repoMismatchOf, sitePath } from "@/lib/site-root";
import { db } from "@/lib/db";
import { getAutopilotReport, type AutopilotArticle, type AutopilotReport } from "@/lib/autopilot/report";
import { friendlyError } from "@/lib/autopilot/friendly";
import { MAX_ATTEMPTS, type JobKind } from "@/lib/jobs";
import { publishTarget, type Project } from "@/lib/projects";
import { reachableArticleUrl } from "@/lib/hosted-blog";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { launchStepError, urlPrefixProperty } from "@/lib/job-handlers/launch";
import type { FirstArticleProgress, ProgressStep, StuckNote } from "@/components/setup-stage/wait";

// Where a new hosted site is on its way to its first live article - the card
// every dashboard page shows instead of its content until then.
//
// DERIVED, never stored. Each step reads the evidence the work itself leaves
// behind: the project row (the blog flip, the Google property), the queue's
// jobs (launch, crawl, autopilot) and the autopilot report (the profile, the
// ideas, the writer's runs and drafts). A stored "step 3 of 6" would be a
// second truth that drifts the first time a job retries, and the card would
// then say "writing" over an article that is already live.
//
// Fails open: a read that errors answers live = true, so the owner gets the
// normal dashboard (half-empty, but real) instead of a card that can't say
// anything true.

type JobRow = { kind: JobKind; error: string | null; finished_at: string | null; claimed_at: string | null; attempts: number; created_at: string };
type JobState = "none" | "pending" | "running" | "retrying" | "done" | "failed";

/** jobs.ts CLAIM_GRACE_MINUTES: a claim younger than this is a live worker. */
const CLAIM_GRACE_MS = 20 * 60_000;

function stateOf(j: JobRow | undefined): JobState {
  if (!j) return "none";
  if (j.finished_at) return j.error ? "failed" : "done";
  // In flight - including its last attempt, which is not a failure yet.
  if (j.claimed_at && Date.now() - Date.parse(j.claimed_at) < CLAIM_GRACE_MS) return "running";
  if (j.attempts >= MAX_ATTEMPTS) return "failed"; // wedged: nothing will retry it
  return j.error ? "retrying" : "pending";
}

const ALL_DONE: FirstArticleProgress = { blog: "done", google: null, reading: "done", topics: "done", writing: "done", publishing: "done" };

/** Sites this instance has already seen with a live first article. Live is
 *  a one-way door, so once seen, the five reads that prove it again on
 *  every page are skipped on this instance; a fresh instance checks once
 *  and gets the same answer those reads gave. */
const seenLive = new Set<string>();

/** One string per distinct answer: what the first-article card compares
 *  between polls (api/first-article/status) to know when to re-render. */
export function firstArticleKey(p: { live: boolean; launched: boolean; progress: FirstArticleProgress; estimate?: string }): string {
  return JSON.stringify([p.live, p.launched, p.progress, p.estimate ?? null]);
}

export async function firstArticleProgress(
  project: Project,
  // The dashboard passes its per-request memoized loader ((dashboard)/mode.ts
  // loadReport), so Home and this card build the report once between them,
  // and only for a site that isn't live yet.
  opts: { loadReport?: (projectId: string) => Promise<AutopilotReport | null> } = {},
): Promise<{ live: boolean; launched: boolean; progress: FirstArticleProgress; estimate?: string }> {
  if (seenLive.has(project.id)) return { live: true, launched: true, progress: ALL_DONE };
  // The cheap answers first, all in one round trip: every established site
  // stops here without building the report on every page render.
  const latestJob = (kind: JobKind) =>
    db()
      .from("jobs")
      .select("kind, error, finished_at, claimed_at, attempts, created_at")
      .eq("project_id", project.id)
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
  const [drafts, guides, launchRes, crawlRes, autopilotRes] = await Promise.all([
    db()
      .from("article_drafts")
      // A removed article was live too (article-owner.ts): the site is not
      // new again because its owner took the first one down.
      .select("published_url, status")
      .eq("project_id", project.id)
      .in("status", ["published", "removing", "removed"])
      .not("published_url", "is", null)
      .order("published_at", { ascending: true })
      .limit(5),
    // A site that published guides before the switch to autopilot is not new.
    db().from("pages").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("type", "guide"),
    latestJob("launch"),
    latestJob("crawl"),
    latestJob("autopilot"),
  ]);
  if (drafts.error || guides.error || launchRes.error || crawlRes.error || autopilotRes.error) {
    return { live: true, launched: false, progress: ALL_DONE };
  }
  const everLive = (drafts.data ?? []) as { published_url: string; status: string }[];
  // The link is the first article that is STILL up; a removed one answers 410.
  const first = everLive.find((d) => d.status !== "removed") ?? (everLive.length ? { published_url: null as string | null } : undefined);
  if (first || (guides.count ?? 0) > 0) {
    seenLive.add(project.id);
    return { live: true, launched: true, progress: { ...ALL_DONE, liveUrl: reachableArticleUrl(project, first?.published_url ?? null, await backendBaseUrl()) } };
  }
  // No launch job = a site set up before the new setup (or one whose launch
  // never queued). The card would wait on steps nobody is running, so the
  // caller shows the normal dashboard instead.
  if (!launchRes.data) return { live: false, launched: false, progress: ALL_DONE };

  const report = await (opts.loadReport ?? getAutopilotReport)(project.id).catch(() => null);
  if (!report) return { live: true, launched: true, progress: ALL_DONE };
  const published = report.articles.find((a) => a.status === "published" && a.url);
  if (published) {
    seenLive.add(project.id);
    return { live: true, launched: true, progress: { ...ALL_DONE, liveUrl: published.url } };
  }

  const latest = new Map<JobKind, JobRow>();
  for (const r of [launchRes, crawlRes, autopilotRes]) if (r.data) latest.set((r.data as JobRow).kind, r.data as JobRow);
  const launch = latest.get("launch");
  const launchState = stateOf(launch);
  const launchFailed = launchState === "failed";
  // Has at least one attempt finished? (A first attempt still pending or
  // running has not touched the blog or Google yet.)
  const launchRan = launchState === "done" || launchFailed || launchState === "retrying" || (launchState === "running" && (launch?.attempts ?? 0) > 1);
  const stepError = (step: "blog" | "crawl" | "google") => launchStepError(launch?.error, step);

  const stuck: Partial<Record<ProgressStep, StuckNote>> = {};
  let blocker: FirstArticleProgress["blocker"] = null;
  let review: FirstArticleProgress["review"] = null;

  // --- blog: done only once the site's own /blog answers from us
  let blog: FirstArticleProgress["blog"] = "doing";
  const target = publishTarget(project);
  const pr = project.hosted_rewrite_pr_url;
  const blogError = stepError("blog");
  if (target === "hosted" && project.hosted_key) {
    if (project.hosted_rewrite_live_at) blog = "done";
    else if (pr === "manual") {
      stuck.blog = { text: "Your host needs one forwarding rule we can't add for you.", href: "/settings?section=publishing", linkLabel: "See the rule" };
    } else if (blogError) {
      stuck.blog = pr
        ? { text: "GitHub wouldn't let us merge the one small change to your site. Merge it and your blog is on.", href: pr, linkLabel: "Merge it" }
        : { text: "We couldn't make the one small change to your site yet.", href: "/settings?section=publishing", linkLabel: "Do it in Settings" };
    } else if (launchRan && pr) {
      stuck.blog = project.auto_merge
        ? { text: "Waiting for your site to deploy." }
        : { text: "Merge the one small change we opened in your repo and your blog is on.", href: pr, linkLabel: "Merge it" };
    }
  } else if (blogError) {
    stuck.blog = { text: "We couldn't switch your blog on yet.", href: "/settings?section=publishing", linkLabel: "Do it in Settings" };
  } else if (launchState === "done" && target === "github" && project.github_repo) {
    blog = "done"; // the site's own blog: articles go next to its posts
  }

  // --- google: no row when the site already had a property, and none
  // until the launch has looked
  let google: FirstArticleProgress["google"] = null;
  if (project.gsc_oauth_refresh_token) {
    if (project.gsc_site_url) {
      google = project.gsc_site_url === urlPrefixProperty(project) ? "done" : null;
    } else if (launchRan) {
      google = "doing";
      // The Google step finished without a property (a read-only grant), or
      // the launch gave up: only the owner's two clicks in Search Console
      // move it now. A Google error on an attempt that will retry (a deploy
      // still landing the verification file) stays "doing".
      if (launchFailed || !stepError("google")) {
        stuck.google = { text: "Google hasn't confirmed the site yet. Two clicks in Search Console do it.", href: "https://search.google.com/search-console" };
      }
    }
  }

  // --- reading
  const crawlState = stateOf(latest.get("crawl"));
  let reading: FirstArticleProgress["reading"] = "todo";
  if (report.setup.profile) reading = "done";
  else if (report.setup.siteUnreadable) {
    reading = "doing";
    stuck.reading = { text: "We couldn't read your homepage. Describe your site in one sentence and the first article starts from that.", href: "/settings", linkLabel: "Describe it" };
  } else if (crawlState === "none" && launchFailed && stepError("crawl")) {
    reading = "doing";
    stuck.reading = { text: "We couldn't start reading your site. Describe it in one sentence and the first article starts from that.", href: "/settings", linkLabel: "Describe it" };
  } else if (crawlState !== "none" || launchState !== "none") reading = "doing";

  // --- topics
  const writerArticles = report.articles.filter((a) => a.source === "writer");
  const ideas = report.ideas.approved;
  let topics: FirstArticleProgress["topics"] = "todo";
  let keywordsFound: number | null = null;
  if (ideas > 0 || writerArticles.length > 0) {
    topics = "done";
    keywordsFound = ideas + writerArticles.length;
  } else if (reading === "done") {
    topics = "doing";
    if (!report.setup.keywordSource) {
      stuck.topics = { text: "Keyword research isn't available for this site yet. Nothing to do on your side; we're on it." };
    } else if (report.ideas.lastResearchAt && stateOf(latest.get("autopilot")) !== "pending") {
      stuck.topics = { text: report.ideas.note ?? "Research found no topic this site can win yet; it searches wider on its next pass." };
    }
  }

  // --- writing + publishing, from the newest writer article
  const newest: AutopilotArticle | undefined = writerArticles[0];
  let writing: FirstArticleProgress["writing"] = topics === "done" ? "doing" : "todo";
  let publishing: FirstArticleProgress["publishing"] = "todo";
  let topic: string | null = null;
  if (newest) {
    topic = newest.title && newest.title !== "Choosing a topic" ? newest.title : newest.keyword;
    if (newest.status === "writing" || newest.status === "verifying") writing = "doing";
    else if (newest.status === "failed") {
      writing = "doing";
      stuck.writing = { text: friendlyError(newest.error) ?? "The writer hit a problem; it retries by itself." };
    } else {
      writing = "done";
      publishing = "doing";
      // Written and waiting for the owner's Publish (article-review.ts):
      // the card's one job now is to hand them the article.
      if (newest.status === "review" && newest.draftId) review = { href: `/articles/${encodeURIComponent(newest.draftId)}`, title: newest.title ?? null };
      else if (newest.status === "needs_setup") {
        const mismatch = target === "github" ? repoMismatchOf(project) : null;
        if (mismatch) blocker = { kind: "repo", repo: mismatch.repo, empty: mismatch.empty, domain: `${project.domain}${sitePath(project)}`, href: `/api/github/install/start?slug=${encodeURIComponent(project.slug)}`, topic: newest.title ?? null };
        // A repo is connected but no folder in it looks like where its posts
        // live (easyrender.app, 2026-11-09: a template /blog with no posts).
        // Nothing switches on by itself here - the owner names the folder or
        // lets us host the blog - so say that, not "the moment it's on".
        stuck.publishing =
          target === "github" && project.github_repo && repoIsNotTheSite(project)
            ? // The connected repo doesn't build the site (repo-site-check.ts):
              // the blocker card above the steps says it in full.
              { text: "Waiting for your site's repository (see above)." }
            : target === "github" && project.github_repo
            ? // Reaching here at all means the hosted fallback found no free
              // address: /blog, /articles and /guides are all the site's own
              // (draft-status.ts blockedReason says the same).
              { text: "The article is ready, but your site already uses /blog, /articles and /guides, so we have no free address to publish it at. Email support@dispatchseo.com and we'll set one up.", href: "mailto:support@dispatchseo.com", linkLabel: "Email us" }
            : { text: "The article is ready. It goes out the moment your blog is switched on." };
      } else if (newest.prUrl && !newest.prMerged) {
        stuck.publishing = { text: "The article is a pull request in your repo, waiting for a merge.", href: newest.prUrl, linkLabel: "Merge it" };
      }
    }
  }

  return {
    live: false,
    launched: true,
    progress: { blog, google, reading, topics, writing, publishing, keywordsFound, topic, liveUrl: null, stuck, blocker, review },
  };
}
