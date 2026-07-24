import { getPipelinePack } from "./pipeline-pack";
import { installationToken } from "./github-app";
import { hasRepoSecret, setRepoSecret } from "./github-app-secrets";
import { fetchProjectToken, type Project } from "./projects";

// Cloud zero-touch install: the backend commits the pipeline pack into the
// customer's repo through the GitHub App and fires the seo-setup workflow -
// replacing the self-host flow's "paste two commands into Claude Code".
// Direct commit to the default branch by design (the owner consented by
// installing the App on this repo, and nobody is watching a terminal to
// merge a PR); branch-protection rejections fall back to an install PR that
// FirstRunStatus already knows how to surface ("your move: merge this").

const GH = "https://api.github.com";
const INSTALL_BRANCH = "dispatchseo-install";

type GhProject = Pick<
  Project,
  "id" | "slug" | "name" | "domain" | "github_repo" | "pipeline_installed_at"
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
  claude_token_present: boolean;
  actions_pr_permission: "set" | "manual-needed";
  error?: string;
};

// The whole install, idempotent - c5 fires it on mount and re-fires it on
// every resume, so each step must tolerate having already happened.
export async function installPipelineToRepo(project: GhProject): Promise<InstallResult> {
  const fail = (error: string): InstallResult => ({
    ok: false,
    error,
    setup_dispatched: false,
    claude_token_present: false,
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

    const tree = await gh(token, "POST", `/repos/${repo}/git/trees`, {
      base_tree: baseTree,
      tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.content })),
    });
    if (tree.status !== 201 || !tree.json?.sha) return fail(`tree create failed: HTTP ${tree.status}`);

    const commit = await gh(token, "POST", `/repos/${repo}/git/commits`, {
      message: "Install the DispatchSEO content pipeline\n\nCommitted by the DispatchSEO GitHub App during onboarding.",
      tree: tree.json.sha,
      parents: [headSha],
    });
    if (commit.status !== 201 || !commit.json?.sha) return fail(`commit create failed: HTTP ${commit.status}`);
    const newSha = String(commit.json.sha);

    const refUpdate = await gh(token, "PATCH", `/repos/${repo}/git/refs/${encodeURIComponent(`heads/${branch}`)}`, {
      sha: newSha,
      force: false,
    });
    if (refUpdate.status !== 200) {
      // Branch protection (or a race) - open the install PR instead. Create
      // or fast-forward the install branch, tolerate it already existing.
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
        // PR already open from a previous attempt.
        mode = "pr";
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

  // Personalization needs the customer's Claude token (wizard c2). Without
  // it the dispatch would burn a run on the preflight - skip and let the
  // wizard/Home nudge instead.
  const claudeTokenPresent = await hasRepoSecret(project, "CLAUDE_CODE_OAUTH_TOKEN");
  let setupDispatched = false;
  if (claudeTokenPresent && mode !== "pr") {
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
    claude_token_present: claudeTokenPresent,
    actions_pr_permission: actionsPerm,
  };
}
