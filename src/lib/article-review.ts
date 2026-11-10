import "server-only";
import { db } from "@/lib/db";
import { effectiveAutomations, type Project } from "@/lib/projects";
import { blockedReason, publishDraftNow, publishRoute } from "@/lib/job-handlers/draft-status";
import { repoIsNotTheSite } from "@/lib/repo-site-check";
import type { OwnerResult } from "@/lib/article-owner";
import { notifyArticleReady } from "@/lib/review-email";

// Review before publishing (migration 0089). The owner picks it once, in
// setup's Publishing step or later in Settings; the default stays what every
// site has always had - an article that passes the gate goes out at once.
//
// With review on, finish.ts parks each finished article as status "review"
// instead of queueing its publish job, and emails the owner a link to it
// (review-email.ts). Nothing has touched their site yet: the article is the
// markdown and the HTML we rendered, nothing more. From there the owner:
//
//   reads it      the article page shows the rendered article
//   edits it      article-owner.ts editArticle, the same editor a live article
//                 uses; on a review row it rewrites the stored source only
//   publishes it  approveArticle below: the row becomes "accepted" and the
//                 ordinary publish job takes it out (hosted, repo PR or
//                 WordPress, the same path an automatic article takes)
//   drops it      discardReviewArticle: "discarded", never published
//
// Both faces call this module: the dashboard (autopilot-actions.ts, the
// setup's choosePublishMode) and the MCP tools set_publish_mode,
// approve_draft, discard_draft and edit_article.

export const REVIEW_STATUS = "review";

/** The writer stops starting new articles while this many already wait on
 *  the owner (scheduler.ts). Writing more for someone who isn't reading them
 *  is spend with no article at the end of it; the next one starts as soon
 *  as they publish or drop one. */
export const MAX_WAITING_FOR_REVIEW = 3;

export type PublishMode = "auto" | "review";

/** Does this site want to read each article before it goes out? Null (never
 *  chosen) and a missing column both mean no. */
export function reviewsArticles(p: Pick<Project, "publish_mode">): boolean {
  return p.publish_mode === "review";
}

/** Can an article actually reach this site right now? publishRoute() says
 *  "repo" for a connected repository even when that repository isn't the
 *  site's code (repo-site-check.ts) - the repo publish parks such an article
 *  itself, and the dashboard shows the wrong-repo card for it. Offering it
 *  for review there would end in a Publish that cannot work. */
export function canPublishNow(project: Project): boolean {
  const route = publishRoute(project);
  if (route !== "wordpress" && route !== "repo" && route !== "hosted") return false;
  return !(route === "repo" && project.github_repo && repoIsNotTheSite(project));
}

export async function setPublishMode(project: Pick<Project, "id">, mode: PublishMode): Promise<{ ok: true } | { ok: false; error: string }> {
  if (mode !== "auto" && mode !== "review") return { ok: false, error: "Pick automatic or review." };
  const { error } = await db().from("projects").update({ publish_mode: mode }).eq("id", project.id);
  if (error) return { ok: false, error: `Couldn't save that: ${error.message}` };
  return { ok: true };
}

export type ReviewItem = {
  id: string;
  title: string;
  keyword: string | null;
  metaDescription: string | null;
  /** When it became ready (the finish wrote the status). */
  readyAt: string;
  updatedAt: string;
  coverUrl: string | null;
  words: number;
};

/** Articles waiting for the owner, oldest first: the order they were
 *  written in is the order they make sense to read. */
export async function listAwaitingReview(projectId: string): Promise<ReviewItem[]> {
  const { data, error } = await db()
    .from("article_drafts")
    .select("id, title, primary_keyword, meta_description, markdown, cover_url, created_at, updated_at")
    .eq("project_id", projectId)
    .eq("status", REVIEW_STATUS)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) return [];
  return ((data ?? []) as { id: string; title: string; primary_keyword: string | null; meta_description: string | null; markdown: string | null; cover_url: string | null; created_at: string; updated_at: string }[]).map((r) => ({
    id: r.id,
    title: r.title,
    keyword: r.primary_keyword,
    metaDescription: r.meta_description,
    readyAt: r.created_at,
    updatedAt: r.updated_at,
    coverUrl: r.cover_url,
    words: (r.markdown ?? "").split(/\s+/).filter(Boolean).length,
  }));
}

export async function countAwaitingReview(projectId: string): Promise<number> {
  const { count, error } = await db()
    .from("article_drafts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", REVIEW_STATUS);
  return error ? 0 : (count ?? 0);
}

type ReviewRow = { id: string; title: string; status: string; updated_at: string; rendered_html: string | null };

async function loadReviewRow(projectId: string, draftId: string): Promise<ReviewRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(draftId)) return null;
  const { data } = await db()
    .from("article_drafts")
    .select("id, title, status, updated_at, rendered_html")
    .eq("id", draftId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as ReviewRow | null) ?? null;
}

/** Why a non-review article can't be published or dropped from here, in
 *  the owner's words. */
function notWaiting(status: string): string {
  switch (status) {
    case "published":
    case "removing":
      return "That article is already live.";
    case "accepted":
    case "finished":
      return "That article is already on its way to your site.";
    case "discarded":
      return "That article was dropped, so it won't be published.";
    case "removed":
      return "That article was removed from your site.";
    default:
      return "That article isn't waiting for your review.";
  }
}

/** Statuses the owner's Publish releases: waiting for review, or parked on
 *  setup (an explicit Publish on a parked article is an approval too, so it
 *  must not bounce back into review at the publish job). */
const RELEASABLE = [REVIEW_STATUS, "blocked_setup"];

/** The owner's Publish: the article leaves review and goes out the way an
 *  automatic one would. `expectedUpdatedAt` (the value the page was rendered
 *  with) refuses a click on a version that has changed since - an edit in
 *  another tab must be read before it is published. */
export async function approveArticle(project: Project, draftId: string, opts: { expectedUpdatedAt?: string } = {}): Promise<OwnerResult> {
  const row = await loadReviewRow(project.id, draftId);
  if (!row) return { ok: false, error: "That article is no longer on this site." };
  if (!RELEASABLE.includes(row.status)) {
    // A double click, or a second tab: the first one already sent it.
    if (row.status === "accepted" || row.status === "finished" || row.status === "published") return { ok: true, message: notWaiting(row.status) };
    return { ok: false, error: notWaiting(row.status) };
  }
  if (!row.rendered_html) return { ok: false, error: "That article isn't ready yet. Try again in a minute." };
  if (opts.expectedUpdatedAt && opts.expectedUpdatedAt !== row.updated_at) {
    return { ok: false, error: "This article changed since you opened it. Reload the page to see the latest version, then publish." };
  }
  // Refuse rather than queue a job that would park itself: "published" for
  // work that cannot run is the lie this codebase keeps banning.
  const route = publishRoute(project);
  if (route !== "wordpress" && route !== "repo" && route !== "hosted") return { ok: false, error: blockedReason(project) };
  if (!canPublishNow(project)) return { ok: false, error: blockedReason(project) };

  const now = new Date().toISOString();
  // Compare-and-swap on status (and the version read): a discard or an edit
  // that landed between our read and this write wins.
  // approved_at marks it as the owner's: if it parks on setup later, its
  // release goes straight out instead of back into review (parkForReviewIfDue).
  let q = db().from("article_drafts").update({ status: "accepted", approved_at: now, updated_at: now }).eq("id", row.id).eq("status", row.status);
  if (opts.expectedUpdatedAt) q = q.eq("updated_at", opts.expectedUpdatedAt);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: `Couldn't publish it just now: ${error.message}` };
  if (!data?.length) return { ok: false, error: "This article changed since you opened it. Reload the page, then publish." };

  await publishDraftNow(project.id, row.id);
  return { ok: true, message: publishingLine(project, route) };
}

function publishingLine(project: Project, route: "wordpress" | "repo" | "hosted"): string {
  if (route === "hosted") return "Publishing now. It's on your site within a few minutes.";
  if (route === "wordpress") return "Publishing now. It's on your WordPress site in about a minute.";
  return effectiveAutomations(project).auto_merge
    ? "Publishing now. We're opening a pull request in your repo; it merges on its own once your site's checks pass."
    : "Publishing now. We're opening a pull request in your repo - merge it and the article is live.";
}

/** The owner's "Don't publish": the article is set aside for good. The row
 *  stays (status discarded) so "what happened to that article" has an
 *  answer, like every other discard. */
export async function discardReviewArticle(project: Pick<Project, "id">, draftId: string): Promise<OwnerResult> {
  const row = await loadReviewRow(project.id, draftId);
  if (!row) return { ok: false, error: "That article is no longer on this site." };
  if (row.status === "discarded") return { ok: true, message: notWaiting(row.status) };
  if (row.status !== REVIEW_STATUS) return { ok: false, error: notWaiting(row.status) };
  const { data, error } = await db()
    .from("article_drafts")
    .update({ status: "discarded", updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", REVIEW_STATUS)
    .select("id");
  if (error) return { ok: false, error: `Couldn't drop it just now: ${error.message}` };
  if (!data?.length) return { ok: false, error: "This article changed since you opened it. Reload the page and try again." };
  return { ok: true, message: "Dropped. It won't be published, and the next article comes on your plan's schedule." };
}

/** The publish job's first question on a review site. An article parked as
 *  blocked_setup was never reviewed - it stopped before the review step
 *  because the site had nowhere to publish - and every way it is released
 *  later (the hourly parked retry, a route switch, a repo found) goes
 *  through the publish job. So that is where it turns into a review
 *  article, emailed like any other, instead of going straight out. True =
 *  parked for review (or already there); the job stops. "accepted" and
 *  "finished" are never touched: those are already approved. */
export async function parkForReviewIfDue(project: Project, draftId: string): Promise<boolean> {
  if (!reviewsArticles(project)) return false;
  // Still nowhere to go (a repo that isn't the site): the publish handler
  // parks it again and the dashboard says why; review would be a dead end.
  if (!canPublishNow(project)) return false;
  const { data } = await db()
    .from("article_drafts")
    .update({ status: REVIEW_STATUS, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("project_id", project.id)
    .eq("status", "blocked_setup")
    // Approved by the owner before it parked: theirs already, it goes out.
    .is("approved_at", null)
    .not("rendered_html", "is", null)
    .select("id, title");
  const parked = (data ?? []) as { id: string; title: string }[];
  if (parked.length) {
    await notifyArticleReady(project, { draftId: parked[0].id, title: parked[0].title });
    return true;
  }
  // Already waiting (a second publish job for the same row) also stops here.
  const { data: row } = await db().from("article_drafts").select("status").eq("id", draftId).eq("project_id", project.id).maybeSingle();
  return (row as { status: string } | null)?.status === REVIEW_STATUS;
}
