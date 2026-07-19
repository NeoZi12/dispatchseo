// Minimal GitHub REST helpers for the dashboard's "ready to ship" cards.
// Reads open seo-labeled PRs on the active project's repo; merges one on
// approval. The repo is a per-project value (projects.github_repo) - null
// means the project has no content pipeline yet, so reads return empty and
// writes no-op. GH_MERGE_TOKEN is optional: without it, reads are
// unauthenticated (60/hr rate limit, fine for one user) and the Merge button
// degrades to a link.

const API = "https://api.github.com";

// No env fallback here on purpose: projects.github_repo is the only source,
// so a project without a connected repo can never read or merge another
// project's PRs. (The pre-migration fallback project carries SEO_TARGET_REPO
// itself - see projects.ts.)
function repoOrDefault(repo: string | null | undefined): string | null {
  return repo ?? null;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "seo-manager-dashboard",
  };
  if (process.env.GH_MERGE_TOKEN) {
    h.Authorization = `Bearer ${process.env.GH_MERGE_TOKEN}`;
  }
  return h;
}

export function canMerge(): boolean {
  return Boolean(process.env.GH_MERGE_TOKEN);
}

export type SeoPr = {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  preview_url: string | null;
};

export async function openSeoPrs(repo: string | null | undefined): Promise<SeoPr[]> {
  const target = repoOrDefault(repo);
  if (!target) return [];
  try {
    // no-store: revalidate's stale-while-revalidate serves a pre-merge PR list
    // long after auto-merge ran, leaving a ghost "Ready to ship" card. One user
    // hitting GitHub live is well within even the unauthenticated rate limit.
    const res = await fetch(`${API}/repos/${target}/pulls?state=open&per_page=20`, {
      headers: headers(),
      cache: "no-store",
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
// workflow the moment a tool suggestion is approved. Fire-and-forget by
// design: approval must never fail because GitHub hiccuped - the weekly
// sweep (Wednesdays) catches anything a missed dispatch leaves behind.
// The payload is a wake-up signal only; the workflow re-reads the queue
// from the MCP, so nothing here is trusted input on the CI side.
export async function dispatchToolBuild(
  repo: string | null | undefined,
  suggestionId: string,
): Promise<void> {
  const target = repoOrDefault(repo);
  if (!target) return; // no pipeline repo -> nothing to wake
  if (!process.env.GH_MERGE_TOKEN) return; // dispatch needs auth; sweep covers it
  try {
    await fetch(`${API}/repos/${target}/dispatches`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: "seo-tool-approved",
        client_payload: { suggestion_id: suggestionId },
      }),
    });
  } catch {
    // Swallowed on purpose - see fire-and-forget note above.
  }
}

// Shared plumbing for the dashboard's fire-a-workflow buttons (Scan now,
// Get takes). Unlike dispatchToolBuild these report the outcome - each
// button gives live feedback and there is no sweep to catch a missed
// dispatch.
async function fireDispatch(
  repo: string | null | undefined,
  eventType: string,
  payload: Record<string, unknown>,
  successMessage: string,
): Promise<{ ok: boolean; message: string }> {
  const target = repoOrDefault(repo);
  if (!target) return { ok: false, message: "No pipeline repo connected for this project." };
  if (!process.env.GH_MERGE_TOKEN) {
    return { ok: false, message: "Needs GH_MERGE_TOKEN - see the one-tap merge setup card." };
  }
  try {
    const res = await fetch(`${API}/repos/${target}/dispatches`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: eventType, client_payload: payload }),
    });
    if (!res.ok) return { ok: false, message: `GitHub answered HTTP ${res.status} - try again.` };
    return { ok: true, message: successMessage };
  } catch {
    return { ok: false, message: "Could not reach GitHub - try again." };
  }
}

// Stage 1 - the Scan now button wakes the repo's trend-scan workflow, which
// sweeps the niche and puts trending SUBJECTS on the radar (topics only).
export function dispatchTrendScan(repo: string | null | undefined) {
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
  repo: string | null | undefined,
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
  repo: string | null | undefined,
  number: number,
): Promise<{ ok: boolean; message: string }> {
  if (!canMerge()) return { ok: false, message: "GH_MERGE_TOKEN not configured" };
  const target = repoOrDefault(repo);
  if (!target) return { ok: false, message: "No repo connected for this project" };
  const res = await fetch(`${API}/repos/${target}/pulls/${number}/merge`, {
    method: "PUT",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ merge_method: "squash" }),
  });
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, message: body.message ?? (res.ok ? "merged" : `HTTP ${res.status}`) };
}
