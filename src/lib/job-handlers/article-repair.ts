import { enqueue, type Job } from "@/lib/jobs";
import { effectiveAutomations, getProjectById } from "@/lib/projects";
import { mergePr, tokenForRef } from "@/lib/github";
import { failuresArePreexisting, fetchPullRequest, githubApi } from "@/lib/repo-publish";
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
//             Open on Auto: merge once GitHub calls the branch clean, or
//             "unstable" for checks that were already red before us
//             (verify.ts's rule). Otherwise look again later.
//
// Giving up closes the pull request: one nobody is watching must not change
// the site some day with nothing recording it. Nothing in our records
// depends on the outcome, so there is nothing to put back.

const MERGEABLE_STATES = new Set(["clean", "has_hooks"]);
const EARLY_ROUNDS = 6;
const EARLY_RETRY_MS = 10 * 60_000;
const LATER_RETRY_MS = 2 * 60 * 60_000;
const MAX_ROUNDS = 90;

type Payload = { draftId: string; prNumber?: number; round?: number };

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
    await rearm(job, draftId, result.prNumber, 0, EARLY_RETRY_MS);
    return;
  }

  const prNumber = Number(p.prNumber);
  const pr = await fetchPullRequest(project, prNumber);
  if (!pr) throw new Error("could not read the pull request from GitHub");
  let merged = Boolean(pr.merged_at);
  if (!merged && pr.state !== "open") return;
  if (!merged && effectiveAutomations(project).auto_merge) {
    const state = String(pr.mergeable_state);
    const mergeable = MERGEABLE_STATES.has(state) || (state === "unstable" && (await failuresArePreexisting(project, pr).catch(() => null)) === true);
    if (mergeable) merged = (await mergePr(project, prNumber)).ok;
  }
  if (merged) {
    const { data } = await db().from("article_drafts").select("published_url").eq("id", draftId).eq("project_id", project.id).maybeSingle();
    const url = (data as { published_url: string | null } | null)?.published_url;
    if (url) warmScreenshotsLater(project.id, [url], 1);
    return;
  }
  if (round < MAX_ROUNDS) {
    await rearm(job, draftId, prNumber, round, round < EARLY_ROUNDS ? EARLY_RETRY_MS : LATER_RETRY_MS);
    return;
  }
  const token = await tokenForRef(project).catch(() => null);
  if (token && project.github_repo) await githubApi(token, "PATCH", `/repos/${project.github_repo}/pulls/${prNumber}`, { state: "closed" }).catch(() => undefined);
}

async function rearm(job: Job, draftId: string, prNumber: number, round: number, afterMs: number): Promise<void> {
  await enqueue({
    projectId: job.project_id,
    kind: "article-repair",
    payload: { draftId, prNumber, round: round + 1 },
    runAfter: new Date(Date.now() + afterMs),
    idempotencyKey: `article-repair:${draftId}:${prNumber}:r${round + 1}`,
  });
}
