import { enqueue, type Job } from "@/lib/jobs";
import { effectiveAutomations, getProjectById } from "@/lib/projects";
import { tokenForRef } from "@/lib/github";
import { fetchPullRequest, githubApi } from "@/lib/repo-publish";
import { landMemo, landPullRequest, mergedWithoutChange, type LandMemo, type LandResult, type Redo } from "@/lib/pr-landing";
import { repairRepoArticle } from "@/lib/article-repair";
import { db } from "@/lib/db";
import { warmScreenshotsLater } from "@/lib/page-screenshot";

// One live repo article that shipped without its cover or its free-plan
// credit (src/lib/article-repair.ts): open the pull request that adds them,
// then see it through, the way owner-pr.ts sees an owner's edit through.
//
//   round 0   build the pull request. An article that lacks nothing ends
//             here without one.
//   later     merged: done. Closed without merging: somebody said no, done.
//             Open: pr-landing.ts gets it merged - on Auto once GitHub
//             calls the branch clean, and through whatever else stands in
//             the way (a red check that is not about the change, a branch
//             that is behind, a conflict). Otherwise look again later.
//
// Giving up closes the pull request: one nobody is watching must not change
// the site some day with nothing recording it. Nothing in our records
// depends on the outcome, so there is nothing to put back.

const EARLY_ROUNDS = 6;
const EARLY_RETRY_MS = 10 * 60_000;
const LATER_RETRY_MS = 2 * 60 * 60_000;
const MAX_ROUNDS = 90;

type Payload = { draftId: string; prNumber?: number; round?: number; /** pr-landing.ts's memo. */ land?: unknown };

export async function runArticleRepairJob(job: Job): Promise<void> {
  const p = job.payload as unknown as Payload;
  const draftId = String(p.draftId ?? "");
  if (!draftId) throw new Error("article-repair job is missing its draft");
  const round = Number(p.round ?? 0);
  const project = await getProjectById(job.project_id);
  if (!project) throw new Error("project no longer exists");

  if (!p.prNumber) {
    const result = await repairRepoArticle(project, draftId);
    if (!result.ok) throw new Error(`article-repair ${draftId}: ${result.error}`);
    if (result.nothing) return;
    console.log(`[article-repair] ${draftId}: PR #${result.prNumber} adds ${result.added.join(" + ")}`);
    await rearm(job, draftId, result.prNumber, 0, EARLY_RETRY_MS, {});
    return;
  }

  const prNumber = Number(p.prNumber);
  const pr = await fetchPullRequest(project, prNumber);
  if (!pr) throw new Error("could not read the pull request from GitHub");
  const memo = landMemo(job.payload);
  const close = async () => {
    const token = await tokenForRef(project).catch(() => null);
    if (token && project.github_repo) await githubApi(token, "PATCH", `/repos/${project.github_repo}/pulls/${prNumber}`, { state: "closed" }).catch(() => undefined);
  };
  // The repair, built again on the site as it is now: the answer to a
  // conflict, and to a merge that landed nothing (below).
  const redo: Redo = async () => {
    const again = await repairRepoArticle(project, draftId);
    if (!again.ok) return null;
    if (!again.nothing) return { prNumber: again.prNumber };
    // The site has both by now (somebody added them): our pull request is moot.
    await close();
    return { gone: true };
  };

  let merged = Boolean(pr.merged_at);
  // Merged by hand in the few minutes the branch held no change (the checks
  // were being run without it, pr-landing.ts): the article still lacks what
  // this was for. Start over.
  if (merged && mergedWithoutChange(pr, memo)) {
    const again = round < MAX_ROUNDS ? await redo().catch(() => null) : null;
    if (again && "prNumber" in again) await rearm(job, draftId, again.prNumber, round, EARLY_RETRY_MS, {});
    return;
  }
  if (!merged && pr.state !== "open") return;
  let land: LandResult | null = null;
  if (!merged) {
    // Everything between "open" and "merged" is pr-landing.ts's.
    land = await landPullRequest(project, pr, memo, { merge: effectiveAutomations(project).auto_merge, redo });
    if (land.outcome === "gone") return;
    merged = land.outcome === "merged";
  }
  if (merged) {
    const { data } = await db().from("article_drafts").select("published_url").eq("id", draftId).eq("project_id", project.id).maybeSingle();
    const url = (data as { published_url: string | null } | null)?.published_url;
    if (url) warmScreenshotsLater(project.id, [url], 1);
    return;
  }
  if (land && round < MAX_ROUNDS) {
    const watch = land.outcome === "replaced" ? land.prNumber : prNumber;
    const afterMs = (land.outcome === "wait" ? land.afterMs : null) ?? (round < EARLY_ROUNDS ? EARLY_RETRY_MS : LATER_RETRY_MS);
    await rearm(job, draftId, watch, round, afterMs, land.memo);
    return;
  }
  await close();
}

async function rearm(job: Job, draftId: string, prNumber: number, round: number, afterMs: number, land: LandMemo): Promise<void> {
  await enqueue({
    projectId: job.project_id,
    kind: "article-repair",
    payload: { draftId, prNumber, round: round + 1, land },
    runAfter: new Date(Date.now() + afterMs),
    idempotencyKey: `article-repair:${draftId}:${prNumber}:r${round + 1}`,
  });
}
