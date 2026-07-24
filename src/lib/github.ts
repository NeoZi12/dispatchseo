// Minimal GitHub REST helpers for the dashboard's "ready to ship" cards.
// Reads open seo-labeled PRs on the active project's repo; merges one on
// approval. The repo is a per-project value (projects.github_repo) - null
// means the project has no content pipeline yet, so reads return empty and
// writes no-op. The merge token is optional: without it, reads are
// unauthenticated (60/hr rate limit, fine for one user) and the Merge button
// degrades to a link.
//
// Token resolution mirrors gsc.ts: the GH_MERGE_TOKEN env var wins when set
// (classic installs); otherwise the encrypted copy the onboarding wizard
// stores in instance_settings (0030). Cached per process; the connect
// action busts it.
//
// CLOUD_MODE: pass the project (a RepoRef object) instead of a bare repo
// string and every call authenticates with a per-installation GitHub App
// token - per-tenant identity AND per-tenant rate limits. String callers
// keep the instance-wide token path unchanged.

import { revalidateTag } from "next/cache";
import { instanceSettings } from "./dashboard-auth";
import { decryptSecret } from "./crypto";
import { isCloudMode } from "./cloud";

const API = "https://api.github.com";

// Either the legacy bare repo string or a project carrying its App
// installation - github_repo identifies the target, the installation id
// picks the credential.
export type RepoRef =
  | string
  | { github_repo: string | null; github_installation_id?: number | null }
  | null
  | undefined;

function refRepo(ref: RepoRef): string | null {
  if (typeof ref === "string") return ref || null;
  return ref?.github_repo ?? null;
}

function refInstallation(ref: RepoRef): number | null {
  if (typeof ref === "string" || !ref) return null;
  return ref.github_installation_id ?? null;
}

async function tokenForRef(ref: RepoRef): Promise<string | null> {
  const installation = refInstallation(ref);
  if (isCloudMode() && installation) {
    try {
      const { installationToken } = await import("./github-app");
      return await installationToken(installation);
    } catch {
      return null;
    }
  }
  return mergeToken();
}

let tokenCache: { value: string | null } | null = null;

export function bustGhTokenCache() {
  tokenCache = null;
}

export async function mergeToken(): Promise<string | null> {
  if (tokenCache) return tokenCache.value;
  let token: string | null = process.env.GH_MERGE_TOKEN ?? null;
  if (!token) {
    try {
      const settings = await instanceSettings();
      const stored = settings?.gh_merge_token;
      token = stored ? await decryptSecret(stored) : null;
    } catch {
      token = null;
    }
  }
  tokenCache = { value: token };
  return token;
}

// The in-stack builder's Claude Code OAuth token (0037), handed to the
// builder container in its /api/builder/jobs poll feed - the same delivery
// path mergeToken() above uses for the GitHub token. Env wins (classic
// installs that set CLAUDE_CODE_OAUTH_TOKEN in .env - though on the app
// container that env is normally unset; the builder honors its own copy
// first regardless), otherwise the wizard-stored encrypted value. Not
// cached: a freshly pasted token must reach the very next poll, and the
// builder polls only every ~10 minutes, so a DB read here is free.
export async function builderClaudeToken(): Promise<string | null> {
  const env = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (env) return env;
  try {
    const stored = (await instanceSettings())?.builder_claude_token;
    return stored ? await decryptSecret(stored) : null;
  } catch {
    return null;
  }
}

async function headers(ref?: RepoRef): Promise<Record<string, string>> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "seo-manager-dashboard",
  };
  const token = await tokenForRef(ref);
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function canMerge(ref?: RepoRef): Promise<boolean> {
  return Boolean(await tokenForRef(ref));
}

export type SeoPr = {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  preview_url: string | null;
};

export async function openSeoPrs(
  repo: RepoRef,
  opts?: { live?: boolean },
): Promise<SeoPr[]> {
  const target = refRepo(repo);
  if (!target) return [];
  try {
    // 60s SWR instead of no-store: a live GitHub round-trip blocked every
    // Home render. Ghost-card safety is kept two ways - every mergePr call
    // (dashboard button AND the MCP merge_pr tool) busts this repo's tag
    // immediately, and the short TTL bounds an external auto-merge's ghost
    // card to ~a minute instead of the long-lived stale list the old comment
    // warned about. The tag is per-repo so one tenant's merge never drops
    // every other tenant's cached list. live: true opts back into a fresh
    // fetch for callers that watch for a PR to APPEAR (the onboarding poll)
    // and layer their own cache over this.
    const res = await fetch(`${API}/repos/${target}/pulls?state=open&per_page=20`, {
      headers: await headers(repo),
      ...(opts?.live
        ? { cache: "no-store" as const }
        : { next: { revalidate: 60, tags: [`seo-prs:${target}`] } }),
    });
    if (!res.ok) return [];
    const prs = (await res.json()) as Array<{
      number: number;
      title: string;
      html_url: string;
      created_at: string;
      labels: Array<{ name: string }>;
    }>;
    const seo = prs.filter((p) => p.labels.some((l) => l.name === "seo"));
    // Fetching the Vercel preview URL from the PR's statuses would need more
    // calls; keep it simple and link the PR page, where the preview link is
    // the first comment.
    return seo.map((p) => ({
      number: p.number,
      title: p.title,
      html_url: p.html_url,
      created_at: p.created_at,
      preview_url: null,
    }));
  } catch {
    return [];
  }
}

// Fires the repository_dispatch that wakes the project repo's tool-builder
// workflow the moment a tool suggestion is approved. Never throws - approval
// must never fail because GitHub hiccuped - but it DOES report whether the
// wake-up actually went out, because callers used to claim "build dispatched"
// over a silent no-op (no repo connected, no token) and the owner would wait
// for a PR that could never come. Callers phrase their response off the
// result; the Wednesday sweep still catches github-error/no-token misses,
// while no-repo can only resolve when a pipeline is installed.
// The payload is a wake-up signal only; the workflow re-reads the queue
// from the MCP, so nothing here is trusted input on the CI side.
export type ToolBuildDispatch =
  | { dispatched: true }
  | { dispatched: false; reason: "no-repo" | "no-token" | "github-error" };

export async function dispatchToolBuild(
  repo: RepoRef,
  suggestionId: string,
): Promise<ToolBuildDispatch> {
  const target = refRepo(repo);
  if (!target) return { dispatched: false, reason: "no-repo" };
  if (!(await tokenForRef(repo))) return { dispatched: false, reason: "no-token" };
  try {
    const res = await fetch(`${API}/repos/${target}/dispatches`, {
      method: "POST",
      headers: { ...(await headers(repo)), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "seo-tool-approved",
        client_payload: { suggestion_id: suggestionId },
      }),
    });
    return res.ok ? { dispatched: true } : { dispatched: false, reason: "github-error" };
  } catch {
    return { dispatched: false, reason: "github-error" };
  }
}

// Shared plumbing for the dashboard's fire-a-workflow buttons (Scan now,
// Get takes). Unlike dispatchToolBuild these report the outcome - each
// button gives live feedback and there is no sweep to catch a missed
// dispatch.
async function fireDispatch(
  repo: RepoRef,
  eventType: string,
  payload: Record<string, unknown>,
  successMessage: string,
): Promise<{ ok: boolean; message: string }> {
  const target = refRepo(repo);
  if (!target) return { ok: false, message: "No pipeline repo connected for this project." };
  if (!(await tokenForRef(repo))) {
    return { ok: false, message: "No GitHub token connected - see the one-tap merge step in setup." };
  }
  try {
    const res = await fetch(`${API}/repos/${target}/dispatches`, {
      method: "POST",
      headers: { ...(await headers(repo)), "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    if (!res.ok) return { ok: false, message: `GitHub answered HTTP ${res.status} - try again.` };
    return { ok: true, message: successMessage };
  } catch {
    return { ok: false, message: "Could not reach GitHub - try again." };
  }
}

// First-run research: the backend fires this once, when a freshly-installed
// project's queue is still empty, so the first keyword ideas (and the rank
// checks that follow from them) land on their own - no "run /seo-research"
// command for the owner. Same wake-up-only payload contract as the others.
export function dispatchResearch(repo: RepoRef) {
  return fireDispatch(
    repo,
    "seo-research",
    { trigger: "first-run" },
    "Research requested - first keyword ideas land in the queue in a few minutes.",
  );
}

// Stage 1 - the Scan now button wakes the repo's trend-scan workflow, which
// sweeps the niche and puts trending SUBJECTS on the radar (topics only).
export function dispatchTrendScan(repo: RepoRef) {
  return fireDispatch(
    repo,
    "seo-trend-scan",
    { trigger: "manual" },
    "Scan requested - trending subjects land on the radar in a few minutes.",
  );
}

// Stage 2 - the Get takes button on a radar subject wakes the trend-expand
// workflow with the topic in the payload. The workflow re-reads the topic
// from the MCP, so the payload is a wake-up signal plus a label, not trusted
// input on the CI side.
export function dispatchTrendExpand(
  repo: RepoRef,
  topicId: string,
  topicTitle: string,
) {
  return fireDispatch(
    repo,
    "seo-trend-expand",
    { topic_id: topicId, topic_title: topicTitle, trigger: "manual" },
    "On it - takes on this subject land here in a few minutes.",
  );
}


export async function mergePr(
  repo: RepoRef,
  number: number,
): Promise<{ ok: boolean; message: string }> {
  if (!(await canMerge(repo))) return { ok: false, message: "No GitHub merge token connected" };
  const target = refRepo(repo);
  if (!target) return { ok: false, message: "No repo connected for this project" };
  try {
    const res = await fetch(`${API}/repos/${target}/pulls/${number}/merge`, {
      method: "PUT",
      headers: { ...(await headers(repo)), "Content-Type": "application/json" },
      body: JSON.stringify({ merge_method: "squash" }),
      // Bound a hung GitHub response so it can't occupy the MCP's 60s budget
      // until the platform kills it. Every sibling call already fails
      // gracefully; so must the one mutation here (it used to throw straight
      // out of the merge_pr tool / dashboard action).
      signal: AbortSignal.timeout(20000),
    });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    // Bust the cached open-PR list for THIS repo on every successful merge,
    // whichever door it came through (dashboard action or the MCP merge_pr
    // tool) - otherwise the "Ready to ship" card ghosts for up to a minute.
    if (res.ok) revalidateTag(`seo-prs:${target}`, "max");
    return { ok: res.ok, message: body.message ?? (res.ok ? "merged" : `HTTP ${res.status}`) };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return { ok: false, message: timedOut ? "GitHub timed out - try again." : "Could not reach GitHub - try again." };
  }
}

// Server-side proof that a repo is actually ready for the pipeline.
// mark_pipeline_installed is what UNLOCKS the owner's dashboard, so it
// refuses the stamp on any problem this can verify from here - the agent's
// self-reported checklist is not taken on faith. Mode-aware: requireApprove
// (auto-merge on) additionally demands the approve half of the Actions
// toggle. Unverifiable situations (no merge token connected, GitHub down)
// return checked:false with no problems - the agent's own gh-based
// checklist is the verifier of record then; a network hiccup must not
// hard-block an honest install.
export async function verifyPipelinePrereqs(
  repo: string,
  requireApprove: boolean,
  ref?: RepoRef,
): Promise<{ checked: boolean; problems: string[] }> {
  const token = await tokenForRef(ref ?? repo);
  if (!token) return { checked: false, problems: [] };
  const h = await headers(ref ?? repo);
  const problems: string[] = [];
  try {
    const [wf, labels, perms, wfStates] = await Promise.all([
      fetch(`${API}/repos/${repo}/contents/.github/workflows/seo-daily.yml`, {
        headers: h,
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${API}/repos/${repo}/labels?per_page=100`, {
        headers: h,
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${API}/repos/${repo}/actions/permissions/workflow`, {
        headers: h,
        signal: AbortSignal.timeout(8000),
      }),
      fetch(`${API}/repos/${repo}/actions/workflows?per_page=100`, {
        headers: h,
        signal: AbortSignal.timeout(8000),
      }),
    ]);
    if (wf.status === 404) {
      problems.push(
        "the pipeline workflows are not on the default branch yet - merge the install PR first",
      );
    }
    if (labels.ok) {
      const names = ((await labels.json()) as Array<{ name: string }>).map((l) => l.name);
      for (const want of ["seo", "seo-tool"]) {
        if (!names.includes(want)) {
          problems.push(`label '${want}' does not exist (gh label create ${want} --repo ${repo})`);
        }
      }
    }
    // GitHub keeps workflow state keyed by file path, so a repo that had
    // the pipeline before (deleted + reinstalled) can silently inherit
    // "disabled" workflows - runs then never fire and nothing errors. A
    // disabled seo workflow means the install does NOT work, whatever the
    // files on the branch say. EXCEPT on docker instances (POSTGREST_URL):
    // there the in-stack builder owns the schedules and the install
    // deliberately disables the phone-home workflows, so state is not a
    // health signal.
    if (wfStates.ok && !process.env.POSTGREST_URL) {
      const { workflows = [] } = (await wfStates.json()) as {
        workflows?: Array<{ path: string; state: string }>;
      };
      for (const w of workflows) {
        if (/\/seo-[^/]+\.ya?ml$/.test(w.path) && w.state !== "active") {
          const file = w.path.split("/").pop();
          problems.push(
            `workflow ${file} is ${w.state.replaceAll("_", " ")} on GitHub - enable it: gh workflow enable ${file} --repo ${repo}`,
          );
        }
      }
    }
    if (perms.ok) {
      const p = (await perms.json()) as {
        default_workflow_permissions?: string;
        can_approve_pull_request_reviews?: boolean;
      };
      if (p.default_workflow_permissions !== "write") {
        problems.push(
          "GitHub Actions cannot open PRs - enable 'Allow GitHub Actions to create and approve pull requests' in the repo's Settings → Actions → General",
        );
      } else if (requireApprove && !p.can_approve_pull_request_reviews) {
        problems.push(
          "auto mode needs the approve half of 'Allow GitHub Actions to create and approve pull requests' (auto-merge approves PRs from a workflow)",
        );
      }
    }
    return { checked: true, problems };
  } catch {
    return { checked: false, problems: [] };
  }
}
