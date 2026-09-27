import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { listProjects } from "@/lib/projects";
import { dispatchScheduledBuild, openSeoPrs } from "@/lib/github";
import { isCloudMode } from "@/lib/cloud";
import { planGate } from "@/lib/billing";
import { inStackBuilderOwnsBuilds } from "@/lib/builder-status";
import {
  dueBuildWork,
  ghJobKey,
  DISPATCH_EVENT,
  type ScheduledWorkflow,
} from "@/lib/build-schedule";
import { reconcileInstallStamp } from "@/lib/install-reconcile";
import { retrySetupIfNeverStarted } from "@/lib/setup-retry";
import { checkRepoSecret } from "@/lib/github-app-secrets";
import { projectAgent } from "@/lib/agents";

// THE SCHEDULER for repos that build through GitHub Actions.
//
// Until now each SEO workflow carried its own cron chain - three attempts a
// day, every day or every target weekday - because GitHub's scheduler defers
// and sometimes drops triggers outright, and a workflow that only fired once
// had no way to recover a missed tick. Two of those three attempts then woke a
// runner purely to re-discover, in a bash guard step, something this backend
// already knew: that the queue was empty, or a PR was still open, or a guide
// had already been built today.
//
// GitHub bills a minimum of one whole minute for every job that claims a
// runner, so those guard-and-exit runs were not free - they were roughly 300
// minutes a month per installed site, about a quarter of a free account's
// entire Actions allowance, spent discovering there was nothing to do.
//
// So the decision moves here. This route runs on OUR schedule (Vercel cron in
// the cloud, the crond container on self-host - both far more reliable than
// GitHub's best-effort scheduler), asks build-schedule.ts what is actually due,
// and wakes a workflow only for real work. The workflows keep a weekly cron as
// a dead-man's switch for the case this backend is the thing that broke.
//
// SILENT FAILURE IS THE HAZARD, and it is designed against explicitly:
//
//   - A dispatch that GitHub REJECTS (bad token, app uninstalled, repo gone)
//     fails here, in code that can see the HTTP status, and lands on the
//     banner + email rails immediately. The old cron chain could not detect
//     this at all - a repo whose schedules had stopped simply went quiet.
//   - A dispatch GitHub ACCEPTS but nothing runs (Actions disabled, quota
//     exhausted, workflow file deleted, event type not listed) returns 204 and
//     looks identical to success. That is what the claim row below is for: the
//     dispatch logs `claimed_only`, and only the workflow's own outcome report
//     supersedes it. An unsuperseded claim goes stale and alarms, exactly like
//     the in-stack builder's.
//
// The result is strictly more observable than what it replaces, which is the
// bar any change to a scheduler has to clear.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Whether THIS instance builds through GitHub Actions at all. A docker install
// running the in-stack builder gets its work from /api/builder/jobs instead;
// dispatching as well would double-build every project on it. The builder
// stamps a heartbeat on every claiming poll, so a recent stamp means it is
// alive and owns the work. The predicate lives in builder-status.ts because
// queue-refill needs the same answer - it used to ask a different question
// (is APP_URL localhost?) and got it wrong on every public-DOMAIN install.

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const result: Record<string, unknown> = {};
  let hadError = false;

  if (await inStackBuilderOwnsBuilds()) {
    // Informational, never a failure: an install whose builder container is
    // running is correctly configured, not broken.
    const skipped = { skipped: "the in-stack builder is handling builds on this instance" };
    await reportCronRun("seo-dispatch", skipped, false);
    return Response.json(skipped);
  }

  const projects = await listProjects();

  // Per-project isolation, per CLAUDE.md: one project's bad token must never
  // stop every other project's builds from being scheduled.
  const perProject = await Promise.allSettled(
    projects.map(async (p) => {
      const out: Record<string, unknown> = {};
      // Only installed pipelines. A mid-wizard project has no workflows to wake
      // yet - an unmet prerequisite is a normal state during onboarding, so it
      // is a quiet skip, never a failed run (CLAUDE.md's setup-gate rule).
      if (!p.github_repo) return out;

      // Plan gate, same shape daily-ranks and hourly-gsc already use. This was
      // the ONLY scheduled path without it: rank tracking and Search Console
      // stopped for a lapsed account while the overnight builder kept running,
      // writing guides and opening PRs for free, indefinitely. The dashboard's
      // own PlanLapsedBanner asserts the opposite in so many words - "Rank
      // tracking, Search Console imports and the overnight builder have all
      // stopped" - so this makes the product's own promise true.
      //
      // A downgrade was the worse case: sites past the new limit had their
      // ranks frozen while their builder kept publishing against stale data.
      // Informational skip, never hadError - a lapsed plan is a normal state,
      // not a broken run (CLAUDE.md's setup-gate rule).
      const gate = await planGate(p.id);
      if (!gate.allowed) {
        out.skipped = `plan: ${gate.reason}`;
        return out;
      }

      if (!p.pipeline_installed_at) {
        // Before skipping, try the self-heal: a setup run that finished but
        // never landed its mark_pipeline_installed call leaves a project that
        // is installed by every backend measurement yet skipped here forever -
        // research and builds never start, silently. Only a positive verify
        // stamps; anything else stays the same quiet skip as before.
        const healed = await reconcileInstallStamp(p);
        if (healed.state !== "stamped") {
          if (healed.state === "blocked") out.install_blocked = healed.problems;
          // Nothing to heal may mean setup never started at all: it is only
          // ever dispatched from the wizard finale, so a project whose key or
          // install landed after that moment waited here forever. Informational
          // either way - never hadError.
          if (healed.state === "not-ready") {
            const retry = await retrySetupIfNeverStarted(p);
            if (retry.state === "dispatched") out.setup_redispatched = `attempt ${retry.attempt}`;
            else if (retry.state === "skipped") out.skipped = retry.reason;
          }
          return out;
        }
        out.install_reconciled = true;
      }

      const wanted = await dueBuildWork(p, (wf) => ghJobKey(wf, p.slug));
      if (wanted.length === 0) return out;

      // Open-PR pre-check. seo-daily's own guard skips when an SEO PR is
      // already open (one at a time, so a stuck PR pauses the builder instead
      // of piling more on top), and the steady state - built, waiting on checks
      // or a merge - is a meaningful share of all days. Asking GitHub here
      // turns that guard from a billed minute into an API call.
      //
      // openSeoPrs never throws: it returns [] on any failure, which reads here
      // as "no open PR" and dispatches. That is the direction we want - the
      // workflow's own guard is still there to catch it, so a GitHub blip costs
      // one wasted runner minute rather than silently pausing all building.
      // This is a saving, never a gate.
      let buildable = wanted;
      if (wanted.includes("build-guide") || wanted.includes("build-tool")) {
        const open = await openSeoPrs(p);
        if (open.length > 0) {
          buildable = wanted.filter((w) => w !== "build-guide" && w !== "build-tool");
          out.build_skipped = `an SEO PR is already open (#${open[0]?.number})`;
        }
      }
      if (buildable.length === 0) return out;

      // Every workflow about to be woken dies in a 9-second preflight if the
      // project's agent credential is not in the repo's secrets - and GitHub
      // emails the owner that failure, for what is usually just "setup not
      // finished" (the exact class the setup-gate rule keeps quiet; it hit
      // the first outside install on 2026-08-02, twice). The backend can now
      // check the secret itself - App token in cloud, the stored PAT on
      // self-host - so verifiably-absent is an informational skip that names
      // the fix. "Couldn't ask" dispatches as before: the workflow's own
      // preflight stays the backstop, and a previously-working pipeline that
      // loses its secret still surfaces through heartbeat staleness.
      try {
        const agentDef = projectAgent(p);
        if (!(await checkRepoSecret(p, agentDef.credential.repoSecretName))) {
          out.skipped =
            `setup incomplete: ${p.github_repo} has no ${agentDef.credential.repoSecretName} ` +
            `secret yet, so its workflows can't run ${agentDef.displayName}. Paste the ` +
            `${agentDef.displayName} credential on the dashboard (it syncs to the repo), or ` +
            `set the repo secret directly.`;
          return out;
        }
      } catch {
        /* can't check from here - dispatch, and let the preflight answer */
      }

      const dispatched: string[] = [];
      const failed: string[] = [];
      for (const wf of buildable) {
        const key = ghJobKey(wf, p.slug);
        const res = await dispatchScheduledBuild(p, DISPATCH_EVENT[wf]);
        if (res.ok) {
          // CLAIM. Written only after GitHub accepts, and under the exact key
          // the workflow itself reports with, so its outcome report supersedes
          // this row. If no report ever arrives - the 204-but-nothing-ran case
          // above - the claim outlives its grace window and the job reads as
          // due again on the next tick AND stale on the dashboard.
          await reportCronRun(key, { claimed: "dispatch", handed_out: true }, false, true);
          dispatched.push(wf);
        } else {
          failed.push(`${wf}: ${res.message}`);
        }
      }
      if (dispatched.length > 0) out.dispatched = dispatched;
      if (failed.length > 0) out.errors = failed;
      return out;
    }),
  );

  const summary: Record<string, unknown> = {};
  perProject.forEach((r, i) => {
    const slug = projects[i]?.slug ?? `project-${i}`;
    if (r.status === "fulfilled") {
      if (Object.keys(r.value).length > 0) summary[slug] = r.value;
      if (r.value.errors) hadError = true;
    } else {
      summary[slug] = { error: String(r.reason) };
      hadError = true;
    }
  });

  result.projects = summary;
  result.checked = projects.length;
  await reportCronRun("seo-dispatch", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
