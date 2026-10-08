import pack from "./pipeline-pack.json";
import { getPipelinePack } from "./pipeline-pack";
import { installationToken } from "./github-app";
import { hasRepoSecret, setRepoSecret } from "./github-app-secrets";
import { fetchProjectToken, type Project } from "./projects";
import { projectAgent } from "./agents";

// Cloud zero-touch install: the backend commits the pipeline pack into the
// customer's repo through the GitHub App and fires the seo-setup workflow -
// replacing the self-host flow's "paste two commands into Claude Code".
// Direct commit to the default branch by design (the owner consented by
// installing the App on this repo, and nobody is watching a terminal to
// merge a PR); branch-protection rejections fall back to an install PR that
// FirstRunStatus already knows how to surface ("your move: merge this").

const GH = "https://api.github.com";
/** The branch an install PR is opened from. install-pr.ts finds "the install
 *  PR" by this head, so it is exported, never re-typed. */
export const INSTALL_BRANCH = "dispatchseo-install";

type GhProject = Pick<
  Project,
  "id" | "slug" | "name" | "domain" | "github_repo" | "pipeline_installed_at" | "agent"
> & { github_installation_id: number | null };

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "dispatchseo-app",
    "Content-Type": "application/json",
  };
}

async function gh(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const res = await fetch(`${GH}${path}`, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  let json: Record<string, unknown> | null = null;
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

export type InstallResult = {
  ok: boolean;
  mode?: "direct" | "pr" | "already-installed" | "up-to-date";
  pr_url?: string;
  setup_dispatched: boolean;
  /**
   * Whether the repo carries the credential for THIS project's agent. Named
   * for the agent rather than for Claude because the check is agent-specific:
   * a Codex project measured against CLAUDE_CODE_OAUTH_TOKEN is always false,
   * which silently withheld the setup dispatch and dead-ended onboarding.
   */
  agent_token_present: boolean;
  /** Display name of the agent the check was made against, for the message. */
  agent_name: string;
  actions_pr_permission: "set" | "manual-needed";
  error?: string;
};

// The whole install, idempotent - c5 fires it on mount and re-fires it on
// every resume, so each step must tolerate having already happened.
export async function installPipelineToRepo(
  project: GhProject,
  // dispatchSetup:false is the UPDATE path (cloud auto-refresh of the pack):
  // rewrite the pack files but DON'T re-fire the one-time seo-setup run - the
  // project is already personalized, and re-running it would burn a Claude run
  // redoing done work. Defaults true for the install path.
  opts: { dispatchSetup?: boolean } = {},
): Promise<InstallResult> {
  const agent = projectAgent(project);
  const fail = (error: string): InstallResult => ({
    ok: false,
    error,
    setup_dispatched: false,
    agent_token_present: false,
    agent_name: agent.displayName,
    actions_pr_permission: "manual-needed",
  });
  if (!project.github_repo) return fail("no repo connected");
  if (!project.github_installation_id) return fail("GitHub App not installed");
  const repo = project.github_repo;

  let token: string;
  try {
    token = await installationToken(project.github_installation_id);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }

  // Tenant identity secret first - workflows are useless without it, and
  // setRepoSecret is a cheap overwrite-in-place on re-runs.
  const mcpToken = await fetchProjectToken(project.id);
  if (!mcpToken) return fail("project MCP token unavailable");
  const secretRes = await setRepoSecret(project, "SEO_MCP_API_KEY", mcpToken);
  if (!secretRes.ok) return fail(`SEO_MCP_API_KEY: ${secretRes.error}`);

  const files = await getPipelinePack(project as unknown as Project);

  // Skip the commit when the repo already carries this pack version - the
  // version file changes on every pack regeneration, so equality means the
  // other 17 files match too.
  const versionFile = files.find((f) => f.path === ".dispatchseo/pipeline-version");
  let mode: InstallResult["mode"] = "direct";
  let prUrl: string | undefined;

  const repoInfo = await gh(token, "GET", `/repos/${repo}`);
  if (repoInfo.status !== 200) return fail(`repo lookup failed: HTTP ${repoInfo.status}`);
  const branch = String(repoInfo.json?.default_branch ?? "main");

  let upToDate = false;
  if (versionFile) {
    const existing = await gh(
      token,
      "GET",
      `/repos/${repo}/contents/${encodeURIComponent(versionFile.path)}?ref=${encodeURIComponent(branch)}`,
    );
    if (existing.status === 200 && typeof existing.json?.content === "string") {
      const current = Buffer.from(existing.json.content as string, "base64").toString("utf8");
      upToDate = current === versionFile.content;
    }
  }

  if (upToDate) {
    mode = "up-to-date";
  } else {
    const ref = await gh(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`);
    const headSha = (ref.json?.object as { sha?: string } | undefined)?.sha;
    if (ref.status !== 200 || !headSha) return fail(`branch ref lookup failed: HTTP ${ref.status}`);
    const headCommit = await gh(token, "GET", `/repos/${repo}/git/commits/${headSha}`);
    const baseTree = (headCommit.json?.tree as { sha?: string } | undefined)?.sha;
    if (headCommit.status !== 200 || !baseTree) return fail("base tree lookup failed");

    // Tree + commit on top of a given head, so the race retry below can redo
    // both against a head that moved under us.
    const buildCommit = async (
      parentSha: string,
      baseTreeSha: string,
    ): Promise<{ sha: string; treeSha: string } | { error: string }> => {
      const tree = await gh(token, "POST", `/repos/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
      });
      if (tree.status !== 201 || !tree.json?.sha) return { error: `tree create failed: HTTP ${tree.status}` };
      const commit = await gh(token, "POST", `/repos/${repo}/git/commits`, {
        message:
          "Install the DispatchSEO content pipeline\n\nCommitted by the DispatchSEO GitHub App during onboarding.",
        tree: String(tree.json.sha),
        parents: [parentSha],
      });
      if (commit.status !== 201 || !commit.json?.sha) return { error: `commit create failed: HTTP ${commit.status}` };
      return { sha: String(commit.json.sha), treeSha: String(tree.json.sha) };
    };

    const built = await buildCommit(headSha, baseTree);
    if ("error" in built) return fail(built.error);
    let newSha = built.sha;

    const refPath = `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`;
    let refUpdate = await gh(token, "PATCH", refPath, { sha: newSha, force: false });

    // A 422 here is ambiguous: branch protection and a LOST RACE are rejected
    // the same way ("not a fast forward"). reconcileStalePacks' debounce is
    // module state, which on Vercel is per-lambda-instance, so two instances
    // can sweep the same repo concurrently - two deploys landing minutes apart
    // (2026-08-02) is enough. Reading that race as protection opened a stray
    // "Install the DispatchSEO content pipeline" PR in a customer repo that
    // was already current. So: re-read the head. If it moved, the other writer
    // won - rebuild on top of it and retry the push ONCE. Genuine protection
    // leaves the head exactly where it was and still falls through to the PR
    // path (and a retry against it would be refused again anyway).
    let raceApplied = false;
    if (refUpdate.status === 422) {
      const freshRef = await gh(token, "GET", `/repos/${repo}/git/ref/${encodeURIComponent(`heads/${branch}`)}`);
      const freshHead = (freshRef.json?.object as { sha?: string } | undefined)?.sha;
      if (freshRef.status === 200 && freshHead && freshHead !== headSha) {
        const freshCommit = await gh(token, "GET", `/repos/${repo}/git/commits/${freshHead}`);
        const freshTree = (freshCommit.json?.tree as { sha?: string } | undefined)?.sha;
        if (freshCommit.status === 200 && freshTree) {
          const retry = await buildCommit(freshHead, freshTree);
          if (!("error" in retry)) {
            if (retry.treeSha === freshTree) {
              // The writer that won committed this very pack: applying our
              // files on top of the new head changes nothing. Don't push an
              // empty commit, and above all don't open a PR - the repo is
              // already current.
              raceApplied = true;
              mode = "up-to-date";
            } else {
              newSha = retry.sha;
              refUpdate = await gh(token, "PATCH", refPath, { sha: newSha, force: false });
            }
          }
        }
      }
    }

    if (!raceApplied && refUpdate.status !== 200) {
      // Branch protection (the race is handled above) - open the install PR
      // instead. Create or fast-forward the install branch, tolerate it
      // already existing.
      const branchRef = await gh(token, "POST", `/repos/${repo}/git/refs`, {
        ref: `refs/heads/${INSTALL_BRANCH}`,
        sha: newSha,
      });
      if (branchRef.status === 422) {
        await gh(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${INSTALL_BRANCH}`)}`, {
          sha: newSha,
          force: true,
        });
      } else if (branchRef.status !== 201) {
        return fail(`install branch create failed: HTTP ${branchRef.status}`);
      }
      const pr = await gh(token, "POST", `/repos/${repo}/pulls`, {
        title: "Install the DispatchSEO content pipeline",
        head: INSTALL_BRANCH,
        base: branch,
        body: "Your branch protection requires a PR - merge this to finish DispatchSEO setup.",
      });
      if (pr.status === 201) {
        mode = "pr";
        prUrl = String(pr.json?.html_url ?? "");
      } else if (pr.status === 422) {
        // PR already open from a previous attempt: link THAT one, so the
        // owner still gets a "merge this" button on a retried install.
        mode = "pr";
        const owner = repo.split("/")[0];
        const existing = await gh(
          token,
          "GET",
          `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${INSTALL_BRANCH}`)}&per_page=1`,
        ).catch(() => null);
        const list = existing?.status === 200 ? (existing.json as unknown as Array<{ html_url?: string }> | null) : null;
        const url = Array.isArray(list) ? list[0]?.html_url : undefined;
        if (url) prUrl = String(url);
      } else {
        return fail(`install PR failed: HTTP ${pr.status}`);
      }
    }
  }

  // Labels the workflows expect; 422 = already there.
  for (const label of [
    { name: "seo", color: "8b5cf6", description: "DispatchSEO content pipeline" },
    { name: "seo-tool", color: "6d28d9", description: "DispatchSEO tool build" },
  ]) {
    await gh(token, "POST", `/repos/${repo}/labels`, label).catch(() => {});
  }

  // Best-effort: allow Actions to open PRs. Unclear whether App tokens may
  // set this at all (likely needs Administration, which we deliberately do
  // not request) - a failure stays a dashboard checklist item, never a
  // blocked install.
  let actionsPerm: InstallResult["actions_pr_permission"] = "manual-needed";
  try {
    const put = await gh(token, "PUT", `/repos/${repo}/actions/permissions/workflow`, {
      default_workflow_permissions: "write",
      can_approve_pull_request_reviews: true,
    });
    if (put.status === 204) actionsPerm = "set";
  } catch {
    // stays manual-needed
  }

  // Personalization needs the customer's agent credential (wizard c2). Without
  // it the dispatch would burn a run on the preflight - skip and let the
  // wizard/Home nudge instead. Which secret that is depends on the project's
  // agent: hardcoding Claude's name here meant every Codex project failed this
  // check, never dispatched setup, and was told its Claude token was missing.
  const agentTokenPresent = await hasRepoSecret(project, agent.credential.repoSecretName);

  // Stamp the agent into the repo's SEO_AGENT Actions variable, best-effort.
  // seo-tool-validate reads vars.SEO_AGENT because it deliberately holds no
  // MCP key and cannot ask the backend; without the stamp it infers from
  // which secrets exist, which goes wrong the day an owner switches agents
  // and the old secret is still lying around. setProjectAgent re-stamps on
  // every switch; this is the fresh-install half of the same contract.
  const { setRepoActionsVariable } = await import("./github");
  await setRepoActionsVariable(project, "SEO_AGENT", agent.id);

  let setupDispatched = false;
  if (opts.dispatchSetup !== false && agentTokenPresent && mode !== "pr") {
    // Don't stack a second setup on top of one already running. The wizard
    // finale re-fires runPipelineInstall on every mount/resume (minutes apart),
    // and a setup run takes 4-7 min - without this guard 2-3 overlapping
    // seo-setup runs race: one gets cancelled, secrets get rewritten mid-run,
    // and the concurrent MCP load has been enough to trip the first research
    // run's DataForSEO plan gate (empty queue on day one). Skip the dispatch if
    // GitHub already shows a queued/in-progress seo-setup run; a run outlives
    // the mount interval, so this catches the repeats. Best-effort: a failed
    // lookup falls through to dispatching, the pre-existing behavior.
    const runs = await gh(
      token,
      "GET",
      `/repos/${repo}/actions/workflows/seo-setup.yml/runs?per_page=20`,
    ).catch(() => null);
    const workflowRuns = (runs?.json?.workflow_runs ?? []) as Array<{ status?: string }>;
    const alreadyRunning = workflowRuns.some(
      (r) => r.status === "in_progress" || r.status === "queued" || r.status === "requested",
    );
    if (alreadyRunning) {
      setupDispatched = true; // already in flight - treat as dispatched, don't stack
    } else {
      const dispatch = await gh(token, "POST", `/repos/${repo}/dispatches`, {
        event_type: "seo-setup",
      });
      setupDispatched = dispatch.status === 204;
    }
  }

  return {
    ok: true,
    mode,
    pr_url: prUrl,
    setup_dispatched: setupDispatched,
    agent_token_present: agentTokenPresent,
    agent_name: agent.displayName,
    actions_pr_permission: actionsPerm,
  };
}

// Post-deploy pack reconcile: push the current pack to every installed cloud
// repo whose .dispatchseo/pipeline-version is behind, the moment a deploy
// carrying a new pack goes live. Before this, a repo only discovered a new
// pack at its own daily seo-token-check - so a workflow fix shipped at 09:07
// left every connected repo running the broken pack until its next daily
// tick, and the first real customer's tool build died at 11:04 on a bug the
// backend had already fixed two hours earlier (2026-08-02, maxpertise). The
// daily check stays as the backstop for a repo this sweep can't reach
// (transient GitHub outage): its "pipeline update available" report still
// triggers the same per-project update via deploy-check's fail path.
//
// Cheap by design: one contents read per project when up to date - the full
// installPipelineToRepo (which also rewrites the repo secret) runs only on a
// version mismatch. Failures are per-project isolated and console-only: the
// github_app_config canary already screams when App auth as a whole is
// broken, and the daily rail re-raises any repo that stays stale.
const PACK_VERSION_PATH = ".dispatchseo/pipeline-version";
let lastPackReconcileAt = 0;

export async function reconcileStalePacks(): Promise<void> {
  // Debounce repeated check-mode hits (workflow retries, manual curls).
  if (Date.now() - lastPackReconcileAt < 5 * 60_000) return;
  lastPackReconcileAt = Date.now();

  const packVersion = ((pack as { version?: string }).version ?? "").trim();
  if (!packVersion) return;

  const { listProjects } = await import("./projects");
  const { planGate } = await import("./billing");
  const projects = await listProjects();
  const failures: string[] = [];
  const awaitingMerge: string[] = [];
  await Promise.allSettled(
    projects.map(async (p) => {
      if (!p.github_repo || !p.github_installation_id || !p.pipeline_installed_at) return;
      // Don't commit into a cancelled customer's repository. The sweep had no
      // billing filter at all, so an account that lapsed but left the App
      // installed kept receiving direct-to-main commits authored by our bot on
      // every deploy, forever. planGate fails open on self-host and wherever
      // Polar isn't configured, so this only ever narrows the cloud case.
      if (!(await planGate(p.id)).allowed) return;
      try {
        const token = await installationToken(p.github_installation_id);
        const res = await gh(
          token,
          "GET",
          `/repos/${p.github_repo}/contents/${encodeURIComponent(PACK_VERSION_PATH)}`,
        );
        const installed =
          res.status === 200 && typeof res.json?.content === "string"
            ? Buffer.from(res.json.content as string, "base64").toString("utf8").trim()
            : null;
        if (installed === packVersion) return;
        const result = await installPipelineToRepo(p, { dispatchSetup: false });
        console.log(
          `[pack-reconcile] ${p.slug}: ${installed ?? "unknown"} -> ${packVersion}: ${
            result.ok ? result.mode : `FAILED: ${result.error}`
          }`,
        );
        if (!result.ok) {
          failures.push(`${p.slug}: ${result.error}`);
        } else if (result.mode === "pr") {
          // Branch protection refused the direct commit, so the pack landed on
          // a PR and the DEFAULT BRANCH still reads the old version. Nothing
          // here can change that - only a human merging can - so on every
          // future deploy this project looks stale again and we force-push the
          // install branch and re-write its secrets, forever. Report it once
          // per sweep and let the owner act, instead of churning their repo in
          // silence.
          awaitingMerge.push(`${p.slug}: ${result.pr_url ?? "install PR open"}`);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.error(`[pack-reconcile] ${p.slug} failed:`, e);
        failures.push(`${p.slug}: ${message}`);
      }
    }),
  );

  // Ride the normal rails. This sweep was console-only, and its stated backstop
  // - the daily seo-token-check - reports as an update NOTICE, which by design
  // never emails and is hidden entirely in cloud. Net effect: a repo that
  // silently stopped receiving pack updates had no surface anywhere, which is
  // exactly how a customer ends up running workflows we fixed hours earlier.
  //
  // Only report when there is something to say: a clean sweep writing an ok row
  // every deploy would flood the health window it shares with every other job.
  if (failures.length > 0 || awaitingMerge.length > 0) {
    const { reportCronRun } = await import("./cron-alerts");
    await reportCronRun(
      "pack-reconcile",
      {
        ...(failures.length > 0 ? { failed: failures } : {}),
        ...(awaitingMerge.length > 0
          ? {
              failed: [
                ...failures,
                ...awaitingMerge.map(
                  (a) =>
                    `${a} - branch protection blocked the direct push, so the pack is waiting on a human merge. ` +
                    `Until it lands, this repo re-syncs on every deploy and its default branch keeps running the old pack.`,
                ),
              ],
            }
          : {}),
      },
      true,
    );
  }
}
