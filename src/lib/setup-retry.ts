import { db } from "./db";
import { reportCronRun } from "./cron-alerts";
import { hasRepoSecret } from "./github-app-secrets";
import { projectAgent } from "./agents";
import type { Project } from "./projects";

// Second chance for the one-time setup run.
//
// seo-setup is dispatched from exactly one place: the wizard finale, on mount
// (runPipelineInstall -> installPipelineToRepo), and only if the agent's
// credential is already on the repo and the install did not fall back to a PR.
// When either is false at that moment, nothing dispatches - and nothing ever
// did again. An owner who pasted the key a minute later, switched agents, or
// merged the install PR was left with live workflows and an empty product:
// the scheduler skips an unstamped project, and the install self-heal only
// stamps on proof that setup ran. The first yearly trial sat that way for two
// days (2026-09-25): wizard complete, key valid, builder waking nightly to an
// empty queue, zero keywords.
//
// So the scheduler retries it. Deliberately narrow - this restarts a run that
// NEVER STARTED, it does not re-run one that failed (that reports on its own
// rails, and re-running it would burn the owner's agent on the same failure):
//   - the owner reached the finale (c5), where the install would have fired
//   - setup left no trace: no site profile, no seo-setup report of any kind
//   - the agent credential is verifiably on the repo
// Every outcome is informational, per the setup-gate rule: a half-set-up
// project is a normal state and must never fail the dispatcher run.

const MARKER = (slug: string) => `first-run-setup--${slug}`;
// A setup run takes 4-7 minutes and the finale dispatches its own on mount, so
// give a fresh project room before concluding nothing started.
const MIN_PROJECT_AGE_MS = 30 * 60_000;
const RETRY_EVERY_MS = 6 * 3_600_000;
const MAX_ATTEMPTS = 3;

export type SetupRetryResult =
  | { state: "dispatched"; attempt: number }
  | { state: "skipped"; reason: string }
  // Not a candidate at all - nothing worth putting in the run log.
  | { state: "not-applicable" };

export async function retrySetupIfNeverStarted(project: Project): Promise<SetupRetryResult> {
  if (project.pipeline_installed_at) return { state: "not-applicable" };
  if (!project.github_repo || !project.github_installation_id) return { state: "not-applicable" };
  if (project.onboarding_screen !== "c5") return { state: "not-applicable" };
  if (Date.now() - new Date(project.created_at).getTime() < MIN_PROJECT_AGE_MS) {
    return { state: "not-applicable" };
  }
  // The scheduler's own throttle is the six-hour gap; everything else (the
  // no-trace guard, the attempt cap, the key check, the install) is the shared
  // dispatch below, in the same order it always ran.
  return dispatchSetupNow(project, {
    minGapMs: RETRY_EVERY_MS,
    recentReason: "setup was re-dispatched recently, waiting on its report",
  });
}

// The setup path's "Start setup again" button reaches this directly, without
// the scheduler's gates above: a button that answered "re-dispatched
// recently" for six hours, or refused a project younger than thirty minutes,
// would be a button that does nothing [R11]. What it keeps is everything that
// protects the owner's agent and repo:
//   - the no-trace guard (a run that STARTED is never ours to restart)
//   - MAX_ATTEMPTS dispatches, ever, counted by the marker rows
//   - a marker debounce (10 minutes by default; the scheduler passes 6 hours)
//   - the agent credential verifiably on the repo, fail-closed
//   - the same idempotent install, whose own guard skips a duplicate dispatch
// A dispatch writes the first-run-setup--<slug> marker through reportCronRun.
// Never throws: every refusal comes back as { state: "skipped", reason } (an
// owner-facing sentence) or "not-applicable" (setup already left a trace, or
// a query failed and proves nothing either way).
const BUTTON_DEBOUNCE_MS = 10 * 60_000;

export async function dispatchSetupNow(
  project: Project,
  opts: { minGapMs?: number; recentReason?: string } = {},
): Promise<SetupRetryResult> {
  const minGapMs = opts.minGapMs ?? BUTTON_DEBOUNCE_MS;
  const recentReason =
    opts.recentReason ?? "setup was started a few minutes ago - give it a moment to report";
  if (project.pipeline_installed_at) return { state: "not-applicable" };
  if (!project.github_repo || !project.github_installation_id) {
    return { state: "skipped", reason: "setup incomplete: connect the GitHub App and pick your repo first" };
  }

  // Any trace of setup means it started, and a run that started is not ours
  // to restart. A query error proves nothing either way - stay out of it.
  try {
    const profile = await db()
      .from("site_profile")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id);
    if (profile.error || (profile.count ?? 0) > 0) return { state: "not-applicable" };
    const reports = await db()
      .from("cron_runs")
      .select("id", { count: "exact", head: true })
      .eq("job", `seo-setup--${project.slug}`);
    if (reports.error || (reports.count ?? 0) > 0) return { state: "not-applicable" };
  } catch {
    return { state: "not-applicable" };
  }

  let attempts = 0;
  try {
    const { data, error } = await db()
      .from("cron_runs")
      .select("created_at")
      .eq("job", MARKER(project.slug))
      .order("created_at", { ascending: false })
      .limit(MAX_ATTEMPTS);
    if (error) return { state: "not-applicable" };
    attempts = (data ?? []).length;
    if (attempts >= MAX_ATTEMPTS) {
      return {
        state: "skipped",
        reason: `setup never reported after ${MAX_ATTEMPTS} dispatches - check the repo's Actions tab`,
      };
    }
    const last = data?.[0]?.created_at as string | undefined;
    if (last && Date.now() - new Date(last).getTime() < minGapMs) {
      return { state: "skipped", reason: recentReason };
    }
  } catch {
    return { state: "not-applicable" };
  }

  // One cheap call before the full install's half-dozen: no key is the common
  // reason setup never started, and it stays a quiet wait until the owner
  // pastes one. Fail-closed on purpose - "couldn't ask" must not dispatch.
  const agent = projectAgent(project);
  if (!(await hasRepoSecret(project, agent.credential.repoSecretName))) {
    return {
      state: "skipped",
      reason: `setup incomplete: no ${agent.displayName} credential on ${project.github_repo} yet`,
    };
  }

  // The same idempotent install the finale runs, so a repo the pack never
  // reached gets it now, and its own guard skips the dispatch when a setup run
  // is already queued or in flight.
  const { installPipelineToRepo } = await import("./pipeline-install");
  let result: Awaited<ReturnType<typeof installPipelineToRepo>>;
  try {
    result = await installPipelineToRepo(project);
  } catch (e) {
    return { state: "skipped", reason: `install retry failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!result.ok) return { state: "skipped", reason: `install retry failed: ${result.error ?? "unknown"}` };
  if (result.mode === "pr") {
    return { state: "skipped", reason: "setup incomplete: the install PR is waiting to be merged" };
  }
  if (!result.setup_dispatched) {
    return { state: "skipped", reason: "GitHub did not accept the setup dispatch" };
  }

  await reportCronRun(MARKER(project.slug), { triggered: "seo-setup", attempt: attempts + 1 }, false);
  return { state: "dispatched", attempt: attempts + 1 };
}
