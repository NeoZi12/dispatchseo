import { checkRepoBuildsSite, findSiteRepo } from "@/lib/repo-site-check";
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

export async function runRepoPublish(project: Project, draftId: string, opts: { storeRetries?: number } = {}): Promise<void> {
  const { data } = await db()
    .from("article_drafts")
    .select(
      "id, title, slug, meta_description, primary_keyword, markdown, faq, sources, cover_url, pr_url, pr_number, repo_path, status, validation",
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

  // Never open an article's pull request in a repository that does not build
  // this site: it would merge and never reach the site (repo-site-check.ts).
  // Parked, not failed - the dashboard says which repo to connect instead,
  // and the draft goes out on its own once the right one is (the hourly
  // drain of parked drafts). An unsure check never blocks.
  if (!row.pr_url) {
    const check = await checkRepoBuildsSite(project);
    if (check.verdict === "mismatch") {
      // The right repo may already be shared with the App: use it.
      const switched = await findSiteRepo(project);
      if (!switched) {
        await markBlockedSetup(draftId);
        return;
      }
      project = switched;
    }
  }

  // A store publish never stores a repo_path (blog-store.ts says why), so an
  // open pull request without one may be a store publish being resumed.
  // Only a site with a store already found: an old markdown PR (rows from
  // before repo_path existed) must not set off a scout.
  if (row.pr_number && !row.repo_path && writerMode(project) === "hosted" && (await publishThroughStore(project, row, { cachedOnly: true, storeRetries: opts.storeRetries }))) return;

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
      // A blog whose posts are data in the repo (a JSON array, an array in a
      // code file) takes the article in its own shape (blog-store.ts). Any
      // failure there falls through to the hosted blog below.
      // Only on Auto: a store publish leans on the verify job's merge and its
      // undo; with merging off, the hosted second path below goes live at once.
      if (effectiveAutomations(project).auto_merge && (await publishThroughStore(project, row, { storeRetries: opts.storeRetries }))) return;
      // No blog in this repo. The old answer was to park the draft and ask
      // the owner for a folder; the new one is to become their blog: switch
      // the project to the hosted route, open the one-line rewrite pull
      // request (best effort - the pages exist on our side either way), and
      // publish this article there now.
      //
      // secondPath: the repo has no folder of posts, so a real blog at the
      // site's /blog (posts kept in a CMS - dfmsolutions.de, 2026-11-10) can
      // never take this article. The hosted blog then answers at /articles
      // and their /blog is left alone; before this the draft parked for good.
      const { switchToHostedBlog } = await import("@/lib/hosted-rewrite");
      const switched = await switchToHostedBlog(project, { secondPath: true });
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
  await recordPullRequest(project, row, result);
}

type OpenedPr = { prUrl: string; prNumber: number; repoPath: string; predictedUrls: string[]; merged: boolean };

/** Record the pull request on the draft and arm its verify chain. Shared by
 *  the markdown route and the store route; `store` rides in the verify
 *  payload so a store publish that breaks is undone instead of commented on
 *  (verify.ts). */
async function recordPullRequest(project: Project, row: { id: string }, result: OpenedPr, opts: { store?: boolean; storeRetries?: number } = {}): Promise<void> {
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
      ...(opts.store ? { store: true, storeRetries: opts.storeRetries ?? 0 } : {}),
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

/** The store route's time on one publish job: the conversion only. A scout
 *  that had to run first gets the job to itself, and the conversion a fresh
 *  one (the drain route's 240 s does not hold a scout, a conversion and a
 *  hosted fallback together). */
const STORE_SCOUT_MS = 120_000;
const STORE_PUBLISH_MS = 150_000;
/** Before a re-queued publish runs: time for the close or undo of the old
 *  pull request to land first. */
const REQUEUE_AFTER_MS = 60_000;

/**
 * Publish into the site's own blog store when it has one (blog-store.ts):
 * true when the pull request is open (or resumed) and recorded - or when the
 * store was only just found and a fresh publish job will convert into it -
 * false when the caller should carry on to its own fallback. Never throws
 * for the store's sake: a store that cannot take this article is the hosted
 * blog's cue, not a failed job. Only on Auto (`cachedOnly`, the resume of a
 * store pull request already open, skips that gate).
 */
export async function publishThroughStore(project: Project, row: RepoDraft & { sources?: unknown }, opts: { cachedOnly?: boolean; storeRetries?: number } = {}): Promise<boolean> {
  if (!project.github_repo) return false;
  if (!opts.cachedOnly && !effectiveAutomations(project).auto_merge) return false;
  const { ensureBlogStore, publishDraftToStore, readBlogStore } = await import("@/lib/blog-store");
  const recipe = await readBlogStore(project.id);
  if (recipe?.status !== "ready") {
    if (opts.cachedOnly) return false;
    const scouted = await ensureBlogStore(project, { deadlineMs: STORE_SCOUT_MS }).catch(() => null);
    if (scouted?.status !== "ready") return false;
    // Found just now. Converting in this same job would run past its budget;
    // a fresh job converts, provided the recipe really was saved (otherwise
    // the next job would scout again, and again).
    if ((await readBlogStore(project.id))?.status !== "ready") return false;
    await enqueue({ projectId: project.id, kind: "publish", payload: { draftId: row.id, storeRetries: opts.storeRetries ?? 0 }, idempotencyKey: `publish:${row.id}:store` });
    return true;
  }
  const sources = Array.isArray(row.sources) ? (row.sources as { url: string; title?: string | null }[]) : null;
  const res = await publishDraftToStore(project, { ...row, sources }, { recipe, deadline: Date.now() + STORE_PUBLISH_MS }).catch((e) => {
    console.warn(`[publish-repo] ${project.slug}: store publish threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  });
  if (!res) return false;
  if (!res.ok) {
    if (res.reason !== "not-store-pr") console.warn(`[publish-repo] ${project.slug}: store publish refused (${res.reason}): ${res.message}${res.problems?.length ? ` - ${res.problems.slice(0, 5).join("; ")}` : ""}`);
    return false;
  }
  await recordPullRequest(project, row, res, { store: true, storeRetries: opts.storeRetries });
  return true;
}

/** The publish job's door to the store route for a draft id (publish.ts:
 *  a site already on a hosted second path). False = publish it hosted. */
export async function runStorePublish(project: Project, draftId: string, opts: { storeRetries?: number } = {}): Promise<boolean> {
  const { data } = await db()
    .from("article_drafts")
    .select("id, title, slug, meta_description, primary_keyword, markdown, faq, sources, cover_url, pr_url, pr_number, repo_path, status, validation")
    .eq("id", draftId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!data) return false;
  const row = data as RepoDraft & { status: string; validation: unknown; sources?: unknown };
  // The hosted publish applies the same allowlist and dry guard itself.
  if (!["accepted", "finished", "blocked_setup"].includes(row.status) || dryDraftBlocked(row.validation)) return false;
  return publishThroughStore(project, row, { cachedOnly: Boolean(row.pr_number && !row.repo_path), storeRetries: opts.storeRetries });
}

/** The draft forgets its store pull request (every verify chain for that PR
 *  then stops: verify.ts compares pr_number) and a publish job places it
 *  again, a minute from now. */
async function requeue(project: Project, draftId: string, key: string, payload: Record<string, unknown> = {}): Promise<void> {
  const { error } = await db()
    .from("article_drafts")
    .update({ pr_url: null, pr_number: null, pr_merged_at: null, updated_at: new Date().toISOString() })
    .eq("id", draftId)
    .eq("project_id", project.id);
  if (error) throw new Error(`could not release the article from its pull request: ${error.message}`);
  await enqueue({ projectId: project.id, kind: "publish", payload: { draftId, ...payload }, runAfter: new Date(Date.now() + REQUEUE_AFTER_MS), idempotencyKey: key });
}

/** A pull request of ours that was merged while its branch held no change
 *  (pr-landing.ts was running the site's checks without the article, and
 *  somebody pressed Merge in those minutes): the article never reached the
 *  repo, so it is published again from the top. */
export async function republishAfterEmptyMerge(project: Project, draftId: string): Promise<void> {
  await requeue(project, draftId, `publish:${draftId}:after-empty-merge`);
}

/**
 * A store publish that broke - its build stayed red after the rebuilds, it
 * conflicted twice, or it merged and the article never appeared - is undone
 * and the article goes to the hosted blog (verify.ts). In this order, so a
 * failure part-way is retried rather than losing the article: the store is
 * marked "none" first (the queued publish must not pick it again), then the
 * draft is released and a publish job queued (which, with no store, puts it
 * on the hosted blog), and only then the pull request closed or its merge
 * undone (blog-store.ts revertStoreMerge: all files or none). Nothing is
 * asked of the owner, and nothing is commented.
 */
export async function abandonStorePublish(project: Project, draftId: string, prNumber: number, opts: { merged: boolean; reason: string; title: string }): Promise<void> {
  const { closeStorePr, markBlogStoreNone, revertStoreMerge } = await import("@/lib/blog-store");
  await markBlogStoreNone(project.id, `a store publish ${opts.reason}`);
  await requeue(project, draftId, `publish:${draftId}:store-fallback`);
  if (opts.merged) {
    const undo = await revertStoreMerge(project, prNumber, opts.title).catch(() => null);
    console.warn(`[publish-repo] ${project.slug}: store publish #${prNumber} ${opts.reason}; ${undo ? `undo ${undo}` : "nothing could be put back safely"}`);
  } else {
    const closed = await closeStorePr(project, prNumber).catch(() => false);
    console.warn(`[publish-repo] ${project.slug}: store publish #${prNumber} ${opts.reason}; ${closed ? "closed" : "could not be closed"}`);
  }
}

/** A store pull request that conflicts with the default branch (another
 *  store publish merged into the same spot first): closed, and the article
 *  written again from a fresh read of the branch - once. A second conflict
 *  sends it to the hosted blog. */
export async function retryConflictedStorePublish(project: Project, draftId: string, prNumber: number, opts: { retries: number; title: string }): Promise<void> {
  if (opts.retries >= 1) {
    return abandonStorePublish(project, draftId, prNumber, { merged: false, reason: "conflicted with the default branch twice", title: opts.title });
  }
  const { closeStorePr } = await import("@/lib/blog-store");
  await requeue(project, draftId, `publish:${draftId}:store-retry`, { storeRetries: opts.retries + 1 });
  await closeStorePr(project, prNumber).catch(() => false);
}
