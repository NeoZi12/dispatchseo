import { db } from "./db";
import { verifyPipelinePrereqs } from "./github";
import { effectiveAutomations, type Project } from "./projects";

// Backend self-heal for the install stamp. The cloud install is zero-touch:
// the App commits the pipeline and the background setup agent is supposed to
// finish by calling mark_pipeline_installed - but that final call sits at the
// end of a run the platform doesn't control, and when it never lands the
// project reads as mid-setup forever: the scheduler (correctly) skips it, so
// research and builds never start, while every backend measurement says the
// install is complete. The first real cloud user hit exactly this (2026-08-02:
// setup ran green twice, workflows live and reporting, stamp never set).
//
// So the backend reconciles from its own evidence instead of waiting on the
// agent's word. Two routes to a stamp:
//   1. The pipeline already shipped: a page from a PR in the connected repo is
//      live and the repo's workflows are reporting in. Nothing left to verify.
//   2. Setup provably ran (site profile saved, or a green seo-setup report)
//      AND verifyPipelinePrereqs positively passes.
// Anything less is a no-op: unlike mark_pipeline_installed, which may stamp on
// the agent's checklist when GitHub is unverifiable, self-heal acts only on
// proof.

export type ReconcileResult =
  // Stamped now - the caller can treat the project as installed immediately.
  | { state: "stamped" }
  // Everything ran but a verifiable problem blocks the unlock (typically the
  // "Allow GitHub Actions to create and approve pull requests" toggle, which
  // the App cannot set itself). These strings are owner-facing.
  | { state: "blocked"; problems: string[] }
  // Not a candidate (already stamped, no repo, setup still running) or GitHub
  // was unverifiable - nothing to conclude either way.
  | { state: "not-ready" };

// The wizard finale polls its status endpoint every 6s and each verify is 4
// GitHub calls, so debounce per project. Module-level like the status route's
// prCache: per-lambda, best-effort, disappears with the instance.
const lastAttempt = new Map<string, { at: number; result: ReconcileResult }>();
const DEBOUNCE_MS = 60_000;

export async function reconcileInstallStamp(
  project: Project & { github_installation_id?: number | null },
): Promise<ReconcileResult> {
  if (project.pipeline_installed_at) return { state: "not-ready" };
  if (!project.github_repo) return { state: "not-ready" };

  const cached = lastAttempt.get(project.id);
  if (cached && Date.now() - cached.at < DEBOUNCE_MS) return cached.result;

  const settle = (result: ReconcileResult): ReconcileResult => {
    lastAttempt.set(project.id, { at: Date.now(), result });
    return result;
  };

  // Strongest evidence first: the pipeline has already done its whole job.
  // A page shipped by a PR in the connected repo, seen live by our own
  // liveness check, cannot exist unless the workflows, the PR permission and
  // the agent token all work - so it stamps without asking GitHub anything.
  if (await shippedLivePage(project)) return settle(await stamp(project.id));

  // Otherwise setup has to have provably run. The saved site profile is one
  // proof; a green seo-setup report from the repo is the other. The profile
  // alone used to be the only one accepted, and a setup run that finished
  // without saving it (2026-09-23: six green setup runs, a published guide,
  // no profile) left the project unstampable here forever.
  if (!(await setupRan(project))) return settle({ state: "not-ready" });

  const verdict = await verifyPipelinePrereqs(
    project.github_repo,
    effectiveAutomations(project).auto_merge,
    project,
  );
  if (!verdict.checked) return settle({ state: "not-ready" });
  if (verdict.problems.length > 0) return settle({ state: "blocked", problems: verdict.problems });

  return settle(await stamp(project.id));
}

// Same stamp mark_pipeline_installed writes, including the pre-0040 fallback
// (migrations are applied by hand, so code can reach a database without
// pipeline_verified).
async function stamp(projectId: string): Promise<ReconcileResult> {
  const stampedAt = new Date().toISOString();
  let { error } = await db()
    .from("projects")
    .update({ pipeline_installed_at: stampedAt, pipeline_verified: true })
    .eq("id", projectId);
  if (error && /pipeline_verified|does not exist/i.test(error.message)) {
    ({ error } = await db()
      .from("projects")
      .update({ pipeline_installed_at: stampedAt })
      .eq("id", projectId));
  }
  return error ? { state: "not-ready" } : { state: "stamped" };
}

// A green report under one of this project's workflow job keys. Claim rows
// are the scheduler's own bookkeeping, not word from the repo, so they never
// count. Tolerant like every pre-migration path - a query error proves nothing.
async function repoReported(project: Project, workflows: string[]): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("cron_runs")
      .select("claimed_only")
      .in("job", workflows.map((w) => `${w}--${project.slug}`))
      .eq("ok", true)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return false;
    return (data ?? []).some((r) => !r.claimed_only);
  } catch {
    return false;
  }
}

async function setupRan(project: Project): Promise<boolean> {
  try {
    const { count, error } = await db()
      .from("site_profile")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    if (!error && (count ?? 0) > 0) return true;
  } catch {
    /* fall through to the workflow report */
  }
  return repoReported(project, ["seo-setup"]);
}

// log_page takes the agent's word for url and pr_url, and a backfill of
// older posts can carry real PR links - so a live page alone is not enough.
// The repo also has to be reporting in, which only installed workflows do.
async function shippedLivePage(project: Project): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("pages")
      .select("pr_url")
      .eq("project_id", project.id)
      .not("live_at", "is", null)
      .not("pr_url", "is", null)
      .limit(50);
    if (error) return false;
    const prefix = `https://github.com/${project.github_repo}/pull/`.toLowerCase();
    const shipped = (data ?? []).some((r) => String(r.pr_url).toLowerCase().startsWith(prefix));
    if (!shipped) return false;
  } catch {
    return false;
  }
  return repoReported(project, ["seo-daily", "seo-tools", "seo-auto-merge", "seo-token-check"]);
}
