import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { effectiveAutomations, getProjectById } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { commentOnPullRequest, fetchPullRequest, githubApi } from "@/lib/repo-publish";
import { afterRemoval, redoOwnerChange } from "@/lib/article-owner";
import { landMemo, landPullRequest, mergedWithoutChange } from "@/lib/pr-landing";
import { warmScreenshotsLater } from "@/lib/page-screenshot";

// Watches a pull request the owner's Edit or Remove opened on a repo article
// (src/lib/article-owner.ts) and settles our records by what happened to it.
//
// The same shape as verify.ts's repo branch, and for the same reason: a PR
// is a wait of hours or days on a human (or on a site's checks), which the
// queue's minute-scale backoff cannot express - so the job re-arms itself,
// each round a completed job rather than a failed one.
//
//   open    on Auto, merge it once GitHub says the branch is clean - never
//           before: verify.ts's rule, "a failing build cannot be merged before
//           its checks have spoken", holds for an edit exactly as for a new
//           article. Whatever else stands between it and the merge is
//           pr-landing.ts's to clear. Otherwise look again later.
//   closed  without merging: somebody said no. An edit's old text goes back
//           (the site never changed); a removal's row goes back to published
//           (the page is still up) with its publish PR's address restored.
//   merged  an edit needs nothing (the row already holds the new text; the
//           site catches up on its deploy) - a removal becomes final: status
//           "removed", page record gone, keyword paused.
//
// Giving up (a month, or the round cap) closes the pull request ourselves,
// with a comment saying why, and is then treated as "closed": the row goes
// back to the truth of the site, which never changed. An open PR nobody is
// watching would otherwise change the site one day with nothing recording it.

const MAX_ROUNDS = 400;
const AUTO_EARLY_ROUNDS = 6;
const AUTO_EARLY_RETRY_MS = 10 * 60_000;
const AWAITING_RETRY_MS = 2 * 60 * 60_000;

type Payload = {
  draftId: string;
  prNumber: number;
  kind: "edit" | "remove";
  round?: number;
  deadline?: string;
  /** pr-landing.ts's memo: what has been tried on this pull request. */
  land?: unknown;
  previous?: { title: string; meta_description: string | null; markdown: string };
  previousPrUrl?: string | null;
};

export async function runOwnerPrJob(job: Job): Promise<void> {
  const p = job.payload as unknown as Payload;
  const draftId = String(p.draftId ?? "");
  const prNumber = Number(p.prNumber);
  if (!draftId || !prNumber || (p.kind !== "edit" && p.kind !== "remove")) throw new Error("owner-pr job is missing its draft, pull request or kind");
  const round = Number(p.round ?? 0);

  const project = await getProjectById(job.project_id);
  if (!project) throw new Error("project no longer exists");
  const { data } = await db()
    .from("article_drafts")
    .select("id, status, published_url, primary_keyword")
    .eq("id", draftId)
    .eq("project_id", project.id)
    .maybeSingle();
  const row = data as { id: string; status: string; published_url: string | null; primary_keyword: string | null } | null;
  if (!row) return;
  // The state this watcher was armed for is gone (a removal landed on an
  // edit's article; a removal was already settled): nothing left to do.
  if (p.kind === "edit" && row.status !== "published") return;
  if (p.kind === "remove" && row.status !== "removing") return;

  const pr = await fetchPullRequest(project, prNumber);
  if (!pr) throw new Error("could not read the pull request from GitHub");
  const now = new Date();

  const memo = landMemo(job.payload);
  // Merged by hand in the few minutes the branch held no change (the checks
  // were being run without it, pr-landing.ts): nothing reached the site, so
  // this is "closed" - the records go back to the site as it is.
  if (mergedWithoutChange(pr, memo)) {
    await revert(project.id, row, p, now.toISOString());
    return;
  }

  if (pr.state === "open") {
    const auto = effectiveAutomations(project).auto_merge;
    // Everything between "open" and "merged" is pr-landing.ts's: a branch
    // that is behind, a conflict (the owner's change is built again on the
    // site as it is now), a repo with squash merging off, a red check that
    // turns out not to be about the change. A merge that worked is settled
    // right here - a round cap must never leave a merged removal sitting as
    // "removing".
    const land = await landPullRequest(project, pr, memo, { merge: auto, redo: () => redoOwnerChange(project, draftId, p.kind) });
    if (land.outcome !== "merged") {
      const before = !p.deadline || now.toISOString() < p.deadline;
      if (before && round < MAX_ROUNDS) {
        const watch = land.outcome === "replaced" ? land.prNumber : prNumber;
        if (watch !== prNumber && p.kind === "remove") {
          await db()
            .from("article_drafts")
            .update({ pr_url: `https://github.com/${project.github_repo}/pull/${watch}`, updated_at: now.toISOString() })
            .eq("id", row.id)
            .eq("status", "removing");
        }
        const afterMs = (land.outcome === "wait" ? land.afterMs : null) ?? (auto && round < AUTO_EARLY_ROUNDS ? AUTO_EARLY_RETRY_MS : AWAITING_RETRY_MS);
        await rearm(job, p, watch, round, new Date(now.getTime() + afterMs), { land: land.memo });
        return;
      }
      // Nobody is going to merge it: close it so it cannot land unwatched
      // later, and put our records back to the site as it is.
      await closePr(project, prNumber, p.kind);
      await revert(project.id, row, p, now.toISOString());
      return;
    }
  } else if (!pr.merged_at) {
    await revert(project.id, row, p, now.toISOString());
    return;
  }

  // Merged.
  if (p.kind === "edit") {
    if (row.published_url) warmScreenshotsLater(project.id, [row.published_url], 1);
    return;
  }
  const { data: flipped } = await db()
    .from("article_drafts")
    .update({ status: "removed", updated_at: now.toISOString() })
    .eq("id", row.id)
    .eq("status", "removing")
    .select("id");
  if (flipped?.length) await afterRemoval(project, row);
}

async function closePr(project: NonNullable<Awaited<ReturnType<typeof getProjectById>>>, prNumber: number, kind: "edit" | "remove"): Promise<void> {
  await commentOnPullRequest(
    project,
    prNumber,
    kind === "edit"
      ? "Closing: this edit waited a month without being merged, so the dashboard shows the article as it is on the site. Edit it again from the dashboard to reopen the change."
      : "Closing: this removal waited a month without being merged, so the dashboard shows the article as live again. Remove it again from the dashboard to reopen it.",
  ).catch(() => false);
  const token = await tokenForRef(project).catch(() => null);
  if (token && project.github_repo) await githubApi(token, "PATCH", `/repos/${project.github_repo}/pulls/${prNumber}`, { state: "closed" }).catch(() => undefined);
}

async function revert(projectId: string, row: { id: string; published_url: string | null }, p: Payload, now: string): Promise<void> {
  if (p.kind === "edit") {
    if (!p.previous) return;
    await db()
      .from("article_drafts")
      .update({ title: p.previous.title, meta_description: p.previous.meta_description, markdown: p.previous.markdown, updated_at: now })
      .eq("id", row.id)
      .eq("status", "published");
    if (row.published_url) await db().from("pages").update({ title: p.previous.title }).eq("project_id", projectId).eq("url", row.published_url);
    return;
  }
  await db()
    .from("article_drafts")
    .update({ status: "published", pr_url: p.previousPrUrl ?? null, updated_at: now })
    .eq("id", row.id)
    .eq("status", "removing");
}

async function rearm(job: Job, p: Payload, prNumber: number, round: number, runAfter: Date, patch: Record<string, unknown> = {}): Promise<void> {
  await enqueue({
    projectId: job.project_id,
    kind: "owner-pr",
    payload: { ...job.payload, ...patch, prNumber, round: round + 1 },
    runAfter,
    idempotencyKey: `owner-pr:${p.draftId}:${prNumber}:r${round + 1}`,
  });
}
