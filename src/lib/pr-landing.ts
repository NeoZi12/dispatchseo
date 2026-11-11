import type { Project } from "@/lib/projects";
import { mergePr, tokenForRef } from "@/lib/github";
import {
  commitAgeMs,
  failuresArePreexisting,
  fetchPullRequest,
  githubApi,
  MAX_PR_REBUILDS,
  pullRequestChecks,
  rebuildPullRequest,
  type PullRequestState,
} from "@/lib/repo-publish";

// Getting one of OUR pull requests merged, whatever GitHub puts in the way.
//
// Three watchers see a pull request through - a new article (verify.ts), an
// owner's Edit or Remove (owner-pr.ts), a repair (article-repair.ts) - and
// each used to know only "clean = merge, anything else = look again later".
// Everything else GitHub can answer left the pull request open for a month,
// with nobody told (owner rule 2026-11-10: nothing is ever asked of the
// owner, so "later" must mean "we deal with it"). This is the one place
// that deals with it, by GitHub's own word for the state:
//
//   unknown   GitHub has not worked it out yet (it does so lazily, on the
//             first read after any push): read again in a few seconds.
//   clean     merge. A repo that switched squash merging off is merged the
//             way it does allow (github.ts mergePr).
//   behind    the repo wants the branch up to date first: update it.
//   dirty     conflicts with the default branch: the caller builds the same
//             change again on the branch as it is now (`redo`).
//   unstable  a check that is NOT required is red or still running.
//   blocked   a REQUIRED check or review is outstanding.
//
// A red check is answered in this order:
//   1. red on the default branch too       the site's own trouble: merge.
//   2. build it again, twice                most red builds are the network.
//   3. still red, and not required          run the checks once WITHOUT our
//      change (a commit on our own branch that puts the files back as the
//      default branch has them). Red again: the check fails whatever is
//      pushed, so it says nothing about our change - put the change back
//      and merge. Green: our change is what breaks it - put it back and
//      stop (`stuck`), the caller decides what that means.
//
// What is left alone on purpose: a REQUIRED check that stays red, and a
// required human review. Those are gates the owner built; we wait at them.
//
// The memo travels in the watcher's job payload between looks.

export type LandMemo = {
  rebuilds?: number;
  updates?: number;
  redos?: number;
  quick?: number;
  probes?: number;
  /** A check run without our change is in flight: `sha` is its commit (the
   *  branch head while it runs), `from` the commit under it that holds our
   *  change, `tree` that commit's tree to put back, `failing` the checks
   *  that were red with the change (null = unreadable). */
  probe?: { sha: string; from: string; tree: string; at: string; failing: string[] | null } | null;
  /** Head commit whose red checks were shown not to be about our change. */
  cleared?: string | null;
  /** Head commit whose red checks were shown to BE about our change. */
  blamed?: string | null;
};

export type LandResult =
  | { outcome: "merged"; memo: LandMemo }
  /** `redo` rebuilt the change under another pull request: watch that one. */
  | { outcome: "replaced"; prNumber: number; memo: LandMemo }
  /** `redo` found nothing left to change and the pull request is finished with. */
  | { outcome: "gone"; memo: LandMemo }
  /** Look again: in `afterMs`, or on the watcher's own cadence when null.
   *  `stuck` names a block nothing here can clear. */
  | { outcome: "wait"; afterMs: number | null; memo: LandMemo; stuck?: "conflict" | "behind" | "red" };

export type Redo = () => Promise<{ prNumber: number } | { gone: true } | null>;

/** Exported for the forwarding pull request's merge (hosted-rewrite.ts),
 *  which must wait for the same word before it merges. */
export const CLEAN = new Set(["clean", "has_hooks"]);
/** The jobs cron runs every five minutes. Both waits land on the NEXT run:
 *  a wait of exactly five minutes falls due seconds after that run started
 *  and is only picked up by the one after, ten minutes on. */
const RELOOK_MS = 2 * 60_000;
const SOON_MS = 4 * 60_000;
const MAX_UPDATES = 6;
const MAX_REDOS = 2;
const MAX_PROBES = 2;
/** Quick looks spent waiting on checks that are still running, per chain: a
 *  check that hangs must not burn the watcher's rounds five minutes at a time. */
const MAX_QUICK = 12;
/** With the checks unreadable (a private repo: the App holds no checks
 *  permission), "unstable" this long after the last push means failed, not
 *  running - preview builds finish in a minute or two. */
const STUCK_RED_MS = 20 * 60_000;
const PROBE_MIN_MS = 4 * 60_000;
const PROBE_GIVE_UP_MS = 60 * 60_000;

export function landMemo(payload: Record<string, unknown>): LandMemo {
  const saved = (payload.land && typeof payload.land === "object" ? payload.land : {}) as LandMemo;
  // `rebuilds` sat at the top of the payload before the memo existed.
  return { ...saved, rebuilds: Number(saved.rebuilds ?? payload.rebuilds ?? 0) };
}

/** The merge that just showed up landed our branch while it held the
 *  no-change commit: it merged nothing. */
export function mergedWithoutChange(pr: PullRequestState, memo: LandMemo): boolean {
  return Boolean(pr.merged_at && memo.probe && memo.probe.sha === pr.head_sha);
}

export async function landPullRequest(
  project: Project,
  seen: PullRequestState,
  memo: LandMemo,
  opts: { merge: boolean; redo?: Redo },
): Promise<LandResult> {
  const m: LandMemo = { ...memo };
  const wait = (afterMs: number | null, stuck?: "conflict" | "behind" | "red"): LandResult => ({ outcome: "wait", afterMs, memo: m, ...(stuck ? { stuck } : {}) });
  const quick = (): LandResult => {
    if ((m.quick ?? 0) >= MAX_QUICK) return wait(null);
    m.quick = (m.quick ?? 0) + 1;
    return wait(SOON_MS);
  };
  // Pinned to the head this look judged (pr, re-read below when GitHub had
  // not worked the state out yet): a push in between makes GitHub refuse
  // with 409, which is a plain "not merged, look again", never an unchecked merge.
  const merge = async (): Promise<LandResult> => ((await mergePr(project, seen.number, pr.head_sha)).ok ? { outcome: "merged", memo: m } : wait(null));

  let pr = seen;
  let state = String(pr.mergeable_state ?? "unknown");
  if (state === "unknown") {
    await new Promise((r) => setTimeout(r, 4000));
    const again = await fetchPullRequest(project, pr.number).catch(() => null);
    if (again && again.state !== "open") return wait(RELOOK_MS);
    if (again) pr = again;
    state = String(pr.mergeable_state ?? "unknown");
    if (state === "unknown") return (m.quick ?? 0) < MAX_QUICK ? ((m.quick = (m.quick ?? 0) + 1), wait(RELOOK_MS)) : wait(null);
  }

  // A check run without our change comes before everything else: while it
  // is in flight the branch holds NO change, and must not be merged.
  if (m.probe) {
    if (pr.head_sha !== m.probe.sha) {
      // Something was pushed over it (an owner's second edit rebuilds the
      // branch from scratch): that push is the branch now.
      m.probe = null;
    } else {
      const verdict = await probeVerdict(project, pr, m.probe);
      if (verdict === "pending") return wait(SOON_MS);
      const back = await pushCommit(project, pr.head_ref, pr.head_sha, m.probe.tree, "chore: the change, back in place");
      if (!back) return wait(SOON_MS);
      m.probe = null;
      if (verdict === "red") {
        m.cleared = back;
        return wait(RELOOK_MS);
      }
      m.blamed = back;
      return wait(null, "red");
    }
  }

  if (state === "draft") return wait(null);
  if (CLEAN.has(state)) return opts.merge ? merge() : wait(null);

  if (state === "dirty") {
    if (!opts.redo || (m.redos ?? 0) >= MAX_REDOS) return wait(null, "conflict");
    m.redos = (m.redos ?? 0) + 1;
    const redone = await opts.redo().catch(() => null);
    if (!redone) return wait(SOON_MS);
    if ("gone" in redone) return { outcome: "gone", memo: m };
    if (redone.prNumber !== pr.number) return { outcome: "replaced", prNumber: redone.prNumber, memo: m };
    return wait(SOON_MS);
  }

  if (state === "behind") {
    if ((m.updates ?? 0) >= MAX_UPDATES) return wait(null, "behind");
    if (!(await updateBranch(project, pr))) return wait(null);
    m.updates = (m.updates ?? 0) + 1;
    return wait(SOON_MS);
  }

  // unstable or blocked: checks (or, for blocked, a review) stand in the way.
  if (state === "unstable" && opts.merge && m.cleared === pr.head_sha) return merge();
  const checks = await pullRequestChecks(project, pr.head_sha).catch(() => null);
  let red: boolean;
  if (checks) red = checks.verdict === "failed";
  else if (state === "unstable") {
    const age = await commitAgeMs(project, pr.head_sha).catch(() => null);
    red = age !== null && age >= STUCK_RED_MS;
  } else red = false;
  if (!red) return checks?.verdict === "pending" || (!checks && state === "unstable") ? quick() : wait(null);

  if (state === "unstable" && opts.merge && checks && (await failuresArePreexisting(project, pr).catch(() => null)) === true) return merge();

  if ((m.rebuilds ?? 0) < MAX_PR_REBUILDS) {
    if (!(await rebuildPullRequest(project, pr.head_ref, pr.head_sha).catch(() => false))) return wait(null);
    m.rebuilds = (m.rebuilds ?? 0) + 1;
    return wait(SOON_MS);
  }

  // Still red after the rebuilds. A required check ("blocked") is the
  // owner's gate; a site whose merges the owner does by hand is the owner's
  // call. Otherwise: find out whether the red is about our change at all.
  if (state !== "unstable" || !opts.merge) return wait(null, "red");
  if (m.blamed === pr.head_sha || (m.probes ?? 0) >= MAX_PROBES) return wait(null, "red");
  const probe = await startProbe(project, pr, checks ? checks.failing.map((f) => f.name) : null);
  if (!probe) return wait(null, "red");
  m.probe = probe;
  m.probes = (m.probes ?? 0) + 1;
  return wait(SOON_MS);
}

/** One commit on `branch`: `tree` as its files, `parent` (the branch head)
 *  as its parent. Never forced - a head that moved in the meantime wins. */
async function pushCommit(project: Project, branch: string, parent: string, tree: string, message: string): Promise<string | null> {
  const repo = project.github_repo;
  const token = repo ? await tokenForRef(project).catch(() => null) : null;
  if (!repo || !token || !branch || !parent || !tree) return null;
  const made = await githubApi(token, "POST", `/repos/${repo}/git/commits`, { message, tree, parents: [parent] });
  const sha = made.json?.sha;
  if (made.status !== 201 || typeof sha !== "string") return null;
  const ref = branch.split("/").map(encodeURIComponent).join("/");
  const moved = await githubApi(token, "PATCH", `/repos/${repo}/git/refs/heads/${ref}`, { sha, force: false });
  return moved.status === 200 ? sha : null;
}

/** Push the no-change commit: the files exactly as the default branch had
 *  them where our branch left it, so the pull request shows no difference
 *  and every check runs on the site as it is without us. */
async function startProbe(project: Project, pr: PullRequestState, failing: string[] | null): Promise<NonNullable<LandMemo["probe"]> | null> {
  const repo = project.github_repo;
  const token = repo ? await tokenForRef(project).catch(() => null) : null;
  if (!repo || !token || !pr.base_sha) return null;
  const [cmp, head] = await Promise.all([
    githubApi(token, "GET", `/repos/${repo}/compare/${pr.base_sha}...${pr.head_sha}`),
    githubApi(token, "GET", `/repos/${repo}/git/commits/${pr.head_sha}`),
  ]);
  const base = ((cmp.json?.merge_base_commit as { commit?: { tree?: { sha?: string } } } | undefined)?.commit?.tree?.sha ?? "") as string;
  const ours = ((head.json?.tree as { sha?: string } | undefined)?.sha ?? "") as string;
  if (cmp.status !== 200 || head.status !== 200 || !base || !ours || base === ours) return null;
  const sha = await pushCommit(project, pr.head_ref, pr.head_sha, base, "chore: run the checks without this change (is the failing check about it?)");
  return sha ? { sha, from: pr.head_sha, tree: ours, at: new Date().toISOString(), failing } : null;
}

/** red = the checks that failed with our change fail without it too.
 *  green = they do not (or it cannot be shown): the change stays blamed. */
async function probeVerdict(project: Project, pr: PullRequestState, probe: NonNullable<LandMemo["probe"]>): Promise<"red" | "green" | "pending"> {
  const age = Date.now() - Date.parse(probe.at);
  const stale = !(age < PROBE_GIVE_UP_MS);
  const checks = await pullRequestChecks(project, probe.sha).catch(() => null);
  if (checks) {
    if (probe.failing?.length) {
      // The verdict is about the checks that were red WITH our change, one
      // by one. Another check finishing first (a review bot that skips an
      // empty diff reports in seconds) says nothing about them.
      const red = new Set(checks.failing.map((f) => f.name));
      if (probe.failing.every((name) => red.has(name))) return "red";
      if (probe.failing.some((name) => checks.passed.includes(name))) return "green";
      if (probe.failing.some((name) => !red.has(name) && checks.running.includes(name))) return stale ? "green" : "pending";
      // Not reported at all: give the build time to start. A check that
      // never runs without our change is a check about our change.
      return age < PROBE_MIN_MS ? "pending" : "green";
    }
    if (checks.verdict === "pending") return stale ? "green" : "pending";
    // Nothing reported yet is not "nothing runs here" until a build had time to start.
    if (checks.verdict === "none") return age < PROBE_MIN_MS ? "pending" : "green";
    return checks.verdict === "failed" ? "red" : "green";
  }
  // Unreadable checks: GitHub's own word for the branch is all there is.
  const state = String(pr.mergeable_state);
  if (state === "unstable") return age >= STUCK_RED_MS ? "red" : "pending";
  if (age < PROBE_MIN_MS) return "pending";
  if (CLEAN.has(state)) return "green";
  return stale ? "green" : "pending";
}

async function updateBranch(project: Project, pr: PullRequestState): Promise<boolean> {
  const repo = project.github_repo;
  const token = repo ? await tokenForRef(project).catch(() => null) : null;
  if (!repo || !token) return false;
  const res = await githubApi(token, "PUT", `/repos/${repo}/pulls/${pr.number}/update-branch`, { expected_head_sha: pr.head_sha });
  return res.status === 202;
}
