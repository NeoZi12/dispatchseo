import { db } from "./db";
import { getCronHealth, reportCronRun } from "./cron-alerts";
import { dispatchResearch } from "./github";
import { listProjects } from "./projects";
import { isCloudMode, isLocalBackendUrl } from "./cloud";
import { inStackBuilderOwnsBuilds } from "./builder-status";
import { builderJobKey } from "./build-schedule";
import { planGate } from "./billing";

// Queue-empty self-heal (2026-07-27 incident).
//
// WHAT WENT WRONG: research is a fixed weekly cron with no buffer. A batch
// queues 7 guides, the daily builder consumes exactly one a day, so the queue
// hits zero on day 7 - and on restock day GitHub's scheduler dropped the 06:23
// trigger, so the 13:23 retry landed at 15:57, 47 minutes AFTER the last build
// window that could have used it. Both seo-daily attempts that day found an
// empty queue and exited "success" in 26 seconds. Nothing failed; nothing
// published either. Scheduler drift makes the ordering non-deterministic, so
// it recurs on its own.
//
// THE FIX: stop treating "the queue is empty" as a terminal state the builder
// shrugs at, and make it a TRIGGER. This sweep runs from the hourly-gsc cron
// (the most frequent backend heartbeat, where recoverStuckBuilds already
// lives) and fires the research workflow for any project whose guide queue has
// genuinely run dry.
//
// WHY THE BACKEND AND NOT seo-daily: the same reason /api/builder/jobs owns
// cadence - scheduling brains belong here, where a fix ships as a deploy
// instead of "every customer must take a new pipeline pack". It also makes the
// behavior identical for every tenant (listProjects), including ones whose
// pack is a version behind.

// How long to wait before firing a second refill at the same project. Sized
// well past a research run's own duration (~10-30 min) plus the build window
// it feeds, so a project that legitimately researches and STILL ends dry - a
// semi-mode owner rejecting everything, a niche with nothing left to find -
// gets one nudge a day, not one every heartbeat.
const REFILL_DEBOUNCE_HOURS = 20;

// Statuses that mean "this guide is still somewhere in the pipeline". pending
// is deliberately included: on a SEMI-mode project the research instructions
// leave ideas pending ON PURPOSE for the owner to decide, so an empty APPROVED
// queue with ten pending ideas is not a dry queue - it is a queue waiting on a
// human. Re-researching there would burn a Claude run and DataForSEO spend to
// pile more ideas on top of the ones already awaiting judgment.
const LIVE_STATUSES = ["approved", "pending", "in_progress"] as const;

// Has this project's guide pipeline genuinely run dry? true = nothing queued,
// nothing pending, nothing building. null = the count failed and the caller
// must NOT treat that as dry.
//
// Shared with /api/builder/jobs so the docker in-stack builder self-heals the
// same way the cloud/GitHub path does - its research cadence is 156h, which
// has exactly the same day-7 drain problem as the weekly cron.
export async function guideQueueDry(projectId: string): Promise<boolean | null> {
  const { count, error } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("type", "guide")
    .in("status", LIVE_STATUSES as unknown as string[]);
  if (error) return null;
  return (count ?? 0) === 0;
}

export type RefillOutcome =
  | { skipped: string }
  | { dry: false }
  | { refilled: true; message: string }
  | { failed: string };

async function refillProject(p: {
  id: string;
  slug: string;
  github_repo: string | null;
  pipeline_installed_at: string | null;
  // Load-bearing on cloud: fireDispatch picks the credential from the App
  // installation id, so a RepoRef without it falls back to the self-host merge
  // token and the dispatch fails to authenticate.
  github_installation_id?: number | null;
}): Promise<RefillOutcome> {
  // Plan gate, same rule and same shape as api/cron/seo-dispatch: a lapsed or
  // uncovered project buys no work. This sweep was the one path left that still
  // WOKE a lapsed customer's repo - the dispatch fires a full research run on
  // their Actions minutes, and every keyword it looks up is DataForSEO spend on
  // the platform account. Informational skip, never hadError: a lapsed plan is
  // a normal state, not a broken run.
  const gate = await planGate(p.id);
  if (!gate.allowed) return { skipped: `plan: ${gate.reason}` };

  // Setup gate, per CLAUDE.md: a project that has not finished onboarding has
  // no workflows to dispatch into, and that is a NORMAL state - informational
  // skip, never an error, never an alert email.
  if (!p.github_repo || !p.pipeline_installed_at) {
    return { skipped: "setup incomplete: no installed pipeline to research into" };
  }

  // Two separate reasons not to hand research to GitHub Actions, and this
  // used to conflate them into one string test on APP_URL:
  //
  // 1. The in-stack builder is alive, so it OWNS the work - /api/builder/jobs
  //    makes research due the moment the queue is dry. Dispatching as well
  //    means two runners research the same project the same day: duplicate
  //    suggestions and DOUBLE DataForSEO spend. This is true no matter how
  //    reachable the backend is, which is exactly what the old URL test got
  //    wrong - start.sh rewrites APP_URL to https://$DOMAIN on every VPS
  //    install, so the recommended setup ran both rails at once.
  // 2. GitHub's runners cannot reach a localhost/LAN/tailnet backend at all,
  //    so a dispatch there fires a run that dies on its first MCP call.
  if (Boolean(process.env.POSTGREST_URL) && (await inStackBuilderOwnsBuilds())) {
    return { skipped: "the in-stack builder claims research itself" };
  }
  if (isLocalBackendUrl(process.env.APP_URL)) {
    return { skipped: "backend is not reachable from GitHub's runners" };
  }

  const dry = await guideQueueDry(p.id);
  // null = the count failed. Tolerant on purpose: a failed count must never be
  // read as "dry", or a database hiccup would dispatch research at every
  // project at once.
  if (dry === null) return { skipped: "queue depth unavailable" };
  if (!dry) return { dry: false };

  // Debounce on when a refill was last ATTEMPTED for this project. The
  // workflow-side `ran_today` guard (seo-weekly-research.yml, backed by
  // ranToday() in /api/project-mode) is the real no-double-batch lock and it
  // keys on a COMPLETED run; this one only stops us re-dispatching into that
  // guard every three hours.
  const health = await getCronHealth(p.slug);
  const marker = `research-refill--${p.slug}`;
  const last = health.find((h) => h.job === marker);
  if (last && Date.now() - new Date(last.last_run_at).getTime() < REFILL_DEBOUNCE_HOURS * 3_600_000) {
    return { skipped: "refill already requested recently" };
  }
  // Already researched today by any path (the Monday cron, an earlier refill,
  // the onboarding first-run trigger)? Then the queue being dry right now is
  // that run's verdict, not a missed trigger.
  //
  // Queried against cron_runs DIRECTLY rather than through getCronHealth,
  // deliberately. getCronHealth hides instance-wide (bare-name) rows from a
  // scoped caller in CLOUD_MODE, so a repo still reporting research under the
  // bare "seo-weekly-research" name would be invisible here - and since the
  // workflow's own ran_today guard now applies only to SCHEDULED runs, a
  // dispatch from this sweep would sail past it and produce a second batch the
  // same day. That is precisely the no-double-research invariant this check
  // exists to hold, so it must not depend on a display-scoping rule.
  // The BARE job name counts only on self-host. There, one owner means one
  // pipeline and a bare "seo-weekly-research" row is this project's own run
  // (repos reporting with CRON_SECRET instead of a project token). In cloud a
  // bare row belongs to whoever reported it - counting it would let one
  // tenant's research suppress every other tenant's refill for the rest of the
  // day, which is worse than the double-batch this check prevents.
  // The in-stack builder reports research under its OWN namespace
  // (builderJobKey -> builder-research--<slug>), so a self-host install whose
  // builder researched this morning and then went quiet would otherwise look
  // like it had never researched at all, and get a second batch dispatched at
  // GitHub - the double-spend this check exists to prevent, through the one
  // key it wasn't looking at.
  const startOfUtcDay = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
  const researchJobNames = isCloudMode()
    ? [`seo-weekly-research--${p.slug}`]
    : [
        "seo-weekly-research",
        `seo-weekly-research--${p.slug}`,
        builderJobKey("research", p.slug),
      ];
  const { data: researchRuns } = await db()
    .from("cron_runs")
    .select("id")
    .in("job", researchJobNames)
    .eq("ok", true)
    .gte("created_at", startOfUtcDay)
    .limit(1);
  if ((researchRuns ?? []).length > 0) {
    return { skipped: "research already completed today" };
  }

  // Marker BEFORE the dispatch, like the onboarding first-run triggers: if the
  // dispatch throws or the process dies mid-call, the debounce still holds and
  // the next heartbeat does not stack a second request.
  await reportCronRun(marker, { triggered: "seo-research", reason: "guide queue empty" }, false);

  const res = await dispatchResearch({
    github_repo: p.github_repo,
    github_installation_id: p.github_installation_id ?? null,
    // instanceTokenAllowedFor keys on the project id (slug accepted while the
    // env allowlist still lists slugs); without them an operator project with
    // no App installation would resolve no credential.
    id: p.id,
    slug: p.slug,
  });
  if (!res.ok) {
    // This project has a connected repo AND a stamped pipeline install, so
    // dispatching into it has demonstrably worked before - a failure now is a
    // REGRESSION (revoked token, App uninstalled, Actions disabled) and gets
    // the loud treatment under its own job name. Scoped to this project's own
    // marker row rather than failing the whole hourly-gsc run, so one broken
    // tenant cannot mask every other tenant's GSC result.
    await reportCronRun(marker, { error: res.message, reason: "guide queue empty" }, true);
    return { failed: res.message };
  }
  return { refilled: true, message: res.message };
}

// Sweep every project. Failure-isolated like the crons themselves: one
// project's problem must never stop the rest from being refilled.
export async function refillEmptyGuideQueues(): Promise<Record<string, RefillOutcome>> {
  const out: Record<string, RefillOutcome> = {};
  try {
    const projects = await listProjects();
    const results = await Promise.allSettled(projects.map((p) => refillProject(p)));
    results.forEach((r, i) => {
      const slug = projects[i].slug;
      out[slug] =
        r.status === "fulfilled"
          ? r.value
          : { failed: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    });
  } catch (e) {
    console.error("[queue-refill] sweep failed:", e);
  }
  return out;
}
