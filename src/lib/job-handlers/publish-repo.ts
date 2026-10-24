import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { publishDraftToRepo, type RepoDraft } from "@/lib/repo-publish";
import { markBlockedSetup } from "./draft-status";
import { dryDraftBlocked, parkDryDraft } from "./dry-guard";
import { effectiveAutomations, writerMode, type Project } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";

// The repo half of the publish job: the article becomes a commit and a pull
// request in the owner's own repository.
//
// It sits beside the WordPress handler rather than inside it because the two
// share nothing but their trigger - one talks to a REST API on the customer's
// server, the other rewrites someone's git history - and the failure taxonomy
// is the only thing worth keeping identical:
//
//   no-content-dir  the owner has not told us where their articles live and we
//                   could not work it out. Their setup, not our breakage: park
//                   the draft, complete the job, and let the Drafts screen ask
//                   them (blockedReason spells out the Settings field).
//   no-token        a GitHub connection IS stored and would not resolve. That
//                   worked before, so it is a regression and stays loud.
//   github-error    GitHub had a bad minute. Throw, and let the queue back off.
//
// How long the article then waits is what the verify job is armed for, and the
// two delays below are the whole reason it re-arms itself: a merged PR is live
// within minutes, an unmerged one waits on a human who might be asleep, and
// the queue's own backoff tops out at sixteen minutes.
const AFTER_MERGE_MS = 2 * 60_000;
const AWAITING_MERGE_MS = 2 * 60 * 60_000;
/** On Auto the verify job is the one that merges - the PR is never merged at
 *  open time, so a build that fails its checks can never be merged unseen. Ten
 *  minutes is long enough for a preview build to finish and short enough that
 *  "automatic" still means the article is out within the hour. */
const AUTO_FIRST_LOOK_MS = 10 * 60_000;

/** How long we keep asking whether an open pull request was merged. A month is
 *  long enough to cover a holiday and short enough that a PR nobody will ever
 *  merge stops costing a job every two hours. */
const VERIFY_DEADLINE_DAYS = 30;

export async function runRepoPublish(project: Project, draftId: string): Promise<void> {
  const { data } = await db()
    .from("article_drafts")
    .select(
      "id, title, slug, meta_description, primary_keyword, markdown, faq, cover_url, pr_url, pr_number, repo_path, status, validation",
    )
    .eq("id", draftId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!data) throw new Error("that article no longer exists");
  const row = data as RepoDraft & { status: string; validation: unknown };

  // ALLOWLIST, not a blocklist, for the same reason the WordPress handler has
  // one: "accepted" is the scheduled case, "finished" a retry, "blocked_setup"
  // a parked draft being released. A discarded draft with a pending job must
  // never turn into a pull request in someone's repo.
  if (!["accepted", "finished", "blocked_setup"].includes(row.status)) return;
  if (dryDraftBlocked(row.validation)) return parkDryDraft(row.id, row.validation);

  const result = await publishDraftToRepo(project, row);

  if (!result.ok) {
    if (result.reason === "no-content-dir" && writerMode(project) !== "hosted") {
      // An agent-mode project (self-host OR an existing cloud customer whose
      // own agent drives the repo) keeps the old answer: park the draft and
      // let the Drafts screen ask for the folder. Only a hosted-writer project
      // is ever switched to our blog on its behalf - flipping a customer's
      // publish route and opening a PR in their repo is not something a
      // folder-detection miss should be able to do.
      await markBlockedSetup(draftId);
      return;
    }
    if (result.reason === "no-content-dir") {
      // No blog in this repo. The old answer was to park the draft and ask
      // the owner for a folder; the new one is to become their blog: switch
      // the project to the hosted route, open the one-line rewrite pull
      // request (best effort - the pages exist on our side either way), and
      // publish this article there now.
      const { switchToHostedBlog } = await import("@/lib/hosted-rewrite");
      const switched = await switchToHostedBlog(project);
      if (!switched) {
        await markBlockedSetup(draftId);
        return;
      }
      const { runHostedPublish } = await import("./publish-hosted");
      return runHostedPublish(switched, draftId);
    }
    if (result.reason === "no-token") {
      // Cloud: publishRoute only lets a project reach here with an App
      // installation (or an allowlisted operator project), so a credential
      // that still will not resolve is a regression - stay loud. Self-host: a
      // repo is routinely named before the merge token is saved
      // (set_github_repo is format-only until then), which is the ordinary
      // mid-setup state the readiness rule says must park quietly.
      if (isCloudMode()) {
        throw new Error(
          "this project's GitHub connection is stored but no credential could be resolved",
        );
      }
      await markBlockedSetup(draftId);
      return;
    }
    throw new Error(`could not open the pull request: ${result.message}`);
  }

  const now = new Date();
  const { error } = await db()
    .from("article_drafts")
    .update({
      pr_url: result.prUrl,
      pr_number: result.prNumber,
      // Empty only on a resumed run, where the path was already stored.
      ...(result.repoPath ? { repo_path: result.repoPath } : {}),
      pr_merged_at: result.merged ? now.toISOString() : null,
      // Not "published": that word is earned by the verify job loading the
      // page. A merged PR is a build that has not finished deploying yet.
      status: "finished",
      updated_at: now.toISOString(),
    })
    .eq("id", row.id);
  if (error) throw new Error(`the pull request is open but we could not record it: ${error.message}`);

  // One watcher per article. A resumed run (the PR was already open) normally
  // finds the chain that came with it still pending and stops here; but a
  // handler that died between the status write above and the enqueue below
  // left the draft with NO chain, and on Auto the verify job is the only
  // place a merge ever happens - so a missing chain is re-armed, never assumed.
  const { count: watching } = await db()
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("kind", "verify")
    .is("finished_at", null)
    .contains("payload", { draftId: row.id });
  if ((watching ?? 0) > 0) return;
  if (result.predictedUrls.length === 0) return;

  await enqueue({
    projectId: project.id,
    kind: "verify",
    payload: {
      draftId: row.id,
      prNumber: result.prNumber,
      urls: result.predictedUrls,
      deadline: new Date(now.getTime() + VERIFY_DEADLINE_DAYS * 24 * 60 * 60_000).toISOString(),
      round: 0,
    },
    runAfter: new Date(
      now.getTime() +
        (result.merged
          ? AFTER_MERGE_MS
          : effectiveAutomations(project).auto_merge
            ? AUTO_FIRST_LOOK_MS
            : AWAITING_MERGE_MS),
    ),
    idempotencyKey: `verify:${row.id}`,
  });
}
