import { after } from "next/server";
import { db } from "@/lib/db";
import { checkCron } from "@/lib/cron-auth";
import { reportCronRun, isPipelineUpdateNotice } from "@/lib/cron-alerts";
import { getProjectByToken, listProjectsChecked } from "@/lib/projects";
import { missingMigrations } from "@/lib/schema-check";
import { isCloudMode } from "@/lib/cloud";
import { planGate, polarConfigured } from "@/lib/billing";
import { appJwt } from "@/lib/github-app";
import { rateLimitHit, rateLimitKey } from "@/lib/rate-limit";

// Post-deploy smoke test. The deploy-check GitHub Action hits this after
// every push to main: first polling with ?expect=<sha> until Vercel serves
// the pushed commit, then letting the check run verify the app's internals
// (core tables reachable, projects resolvable, GSC creds parse). Results go
// through reportCronRun, so a broken deploy shows on the dashboard Home
// banner and emails the owner immediately instead of surfacing as mystery
// cron failures the next morning. The workflow also probes the outside
// surface (/login, the MCP gate) and reports what it finds via ?fail=.
//
// The route doubles as the generic outcome-report door for GitHub-side
// automation: the SEO workflows and the secrets canary call it with
// ?job=<name>&ok=1 / &fail=<message>, which is how their failures reach the
// dashboard instead of dying quietly in the Actions tab.

export const maxDuration = 60;

// One cheap head-count per table the app can't function without. Catches a
// deploy pointed at the wrong Supabase, a dropped/renamed table, or a dead
// service-role key - the failure modes that otherwise wait for the 4am cron.
const CORE_TABLES = [
  "projects",
  "suggestions",
  "keywords",
  "pages",
  "rank_checks",
  "gsc_stats",
  "cron_runs",
] as const;

// The only job names a project token may report under: the basenames (no
// extension) of the pipeline pack's workflows in
// templates/pipeline/.github/workflows/, plus seo-pipeline-version, which
// seo-token-check.yml reports the pack-update notice under. Keep this in step
// with that folder - a workflow missing here gets every report 400'd. The
// owner's CRON_SECRET (the in-stack builder, our own crons) is not limited.
const PIPELINE_REPORT_JOBS: readonly string[] = [
  "seo-auto-merge",
  "seo-canary",
  "seo-daily",
  "seo-geo-scan",
  "seo-setup",
  "seo-token-check",
  "seo-tool-validate",
  "seo-tools",
  "seo-trend-expand",
  "seo-trend-scan",
  "seo-weekly-research",
  "seo-pipeline-version",
];

async function checkTable(name: string): Promise<string | null> {
  const { error } = await db().from(name).select("*", { count: "exact", head: true });
  return error ? error.message : null;
}

export async function GET(req: Request): Promise<Response> {
  // Two accepted callers. CRON_SECRET is the instance owner (full access,
  // unscoped job names, all modes). A per-project MCP token is a connected
  // repo's CI phoning an outcome home (report mode ONLY - no smoke tests, no
  // poll mode); its job name gets suffixed with the project slug so two
  // projects reporting "seo-daily" never overwrite each other's state.
  let projectSuffix = "";
  // Hoisted so the report path below can act on the reporting project (cloud
  // pack auto-update). Null for the owner-token smoke tests (unscoped jobs).
  let reporterProject: Awaited<ReturnType<typeof getProjectByToken>> | null = null;
  const denied = await checkCron(req);
  if (denied) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
    const project = token ? await getProjectByToken(token) : null;
    if (!project) return denied;
    reporterProject = project;
    projectSuffix = `--${project.slug}`;
  }

  const url = new URL(req.url);
  const liveSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";

  // Poll mode: no side effects while the pushed commit isn't serving yet.
  // Owner-only (project tokens are report-only by contract - they fall
  // through to the job check below and 403 without a job param).
  const expected = url.searchParams.get("expect");
  if (expected && expected !== liveSha && !projectSuffix) {
    return Response.json(
      { waiting: true, live_sha: liveSha || null, expected },
      { status: 202 },
    );
  }

  // Report mode: an external reporter asks us to record an outcome so the
  // banner + email rails fire. Two callers: the deploy-check workflow when it
  // sees a failure this process can't see itself (deploy never went live,
  // /login broken from outside), and the SEO workflows + secrets canary
  // phoning their run outcomes home under their own job name (?job=seo-daily
  // with either &fail=<message> or &ok=1; success rows clear the banner).
  const jobParam = url.searchParams.get("job");
  // 120, not 40. The in-stack builder reports under its own composite key,
  // `builder-<workflow>--<slug>` (api/builder/jobs/route.ts) - and
  // "builder-build-guide--" is already 21 characters, so the old cap left just
  // 19 for the slug. Any project whose slug ran longer (a multi-label domain
  // falls back to the full dashed form, e.g. app-myreallylongdomain-com) had
  // every outcome report rejected with a 400 - and run.sh's report() ends in
  // `|| true`, so the builder never noticed. The claim row was then never
  // superseded by a real outcome: the job read as permanently in-flight, the
  // dashboard banner and get_cron_health stayed blind to it, and nothing
  // anywhere said so (2026-07-27). cron_runs.job is `text` (0020), so the cap
  // is only here to keep junk out of the log, not a storage constraint.
  if (jobParam && !/^[a-z0-9_-]{1,120}$/.test(jobParam)) {
    return Response.json({ error: "bad job name" }, { status: 400 });
  }
  if (projectSuffix && !jobParam) {
    return Response.json(
      {
        error:
          "project tokens may only report (job=<name> with ok=1, deferred=<reason>, or fail=<message>)",
      },
      { status: 403 },
    );
  }
  if (reporterProject && jobParam) {
    if (!PIPELINE_REPORT_JOBS.includes(jobParam)) {
      return Response.json(
        { error: `unknown job "${jobParam}" - project tokens may only report pipeline workflow outcomes` },
        { status: 400 },
      );
    }
    if (!(await rateLimitHit(rateLimitKey("deploy-report", reporterProject.slug), 60, 3600))) {
      return Response.json({ error: "too many outcome reports from this project - try again later" }, { status: 429 });
    }
  }
  const job = (jobParam ?? "deploy-check") + projectSuffix;

  // A report from a project whose plan no longer covers it is answered
  // honestly and dropped. reportCronRun refuses it anyway (that gate has to
  // live there - the in-stack builder, the refill sweep and the recovery sweep
  // all report through other doors), but a caller told "recorded" about a row
  // that was never written is exactly the shape of lie that costs an hour of
  // debugging later: this is the endpoint someone curls by hand when a repo
  // looks connected and the dashboard never moves. Fails open like every plan
  // gate - an unreadable subscription reports as normal.
  if (reporterProject) {
    let planPaused = false;
    try {
      planPaused = !(await planGate(reporterProject.id)).allowed;
    } catch (e) {
      console.error(`[deploy-check] plan check failed for ${reporterProject.slug}:`, e);
    }
    if (planPaused) {
      return Response.json({
        ignored: "this project's plan is not active - its pipeline is paused, so run outcomes are not recorded",
        job,
      });
    }
  }

  const failMsg = url.searchParams.get("fail");
  if (failMsg) {
    const result = { sha: liveSha || null, error: failMsg.slice(0, 300) };
    await reportCronRun(job, result, true);
    // Cloud auto-update: a "pipeline update available" report means the repo's
    // pack is a version behind ours. On cloud WE host the pipeline, so this is
    // ours to fix - push the current pack through the GitHub App instead of
    // showing the customer a "paste this into Claude Code" prompt (that's the
    // self-host path; self-host has no App). Fire-and-forget via after() so the
    // report response stays instant. dispatchSetup:false - the project is
    // already set up, an update only refreshes the workflow shims; the pack is
    // designed so re-applying never clobbers repo-owned adaptations
    // (publish-paths etc. are never shipped in the pack). The next daily
    // version check then reports ok and the notice clears on its own.
    if (
      isCloudMode() &&
      reporterProject?.github_installation_id &&
      isPipelineUpdateNotice(job, [result.error])
    ) {
      const proj = reporterProject;
      after(async () => {
        try {
          const { installPipelineToRepo } = await import("@/lib/pipeline-install");
          await installPipelineToRepo(proj, { dispatchSetup: false });
        } catch (e) {
          console.error(`[deploy-check] cloud pack auto-update failed for ${proj.slug}:`, e);
        }
      });
    }
    return Response.json({ recorded: result.error, job });
  }
  // DEFERRED: the run happened, hit a usage limit, and built nothing. Not a
  // failure (nothing is broken, the allowance refills) but emphatically not a
  // completion either, and the difference now has teeth.
  //
  // Reporting these as `ok` was harmless when each builder carried its own
  // three-times-a-day cron: the later triggers fired off GitHub's clock and
  // never consulted cron_runs, so a deferral at 05:13 still got retried at
  // 12:13. Now the backend decides what is due by READING these rows
  // (build-schedule.ts), and a plain `ok` row is a completed run - it resets
  // the full 20h cadence window and suppresses the very retry the deferral
  // needs. A guide deferred in the evening would silently slip a whole day,
  // showing green the entire time.
  //
  // So it lands as claimedOnly: a row that says "handed out, never finished".
  // The short claim-grace window governs instead of the cadence, so the next
  // dispatcher tick re-fires it within hours - and if deferrals keep coming
  // for a day and a half, the claim goes stale and alarms, which is the right
  // answer for an account that is permanently out of allowance.
  const deferredMsg = url.searchParams.get("deferred");
  if (deferredMsg) {
    await reportCronRun(
      job,
      { sha: liveSha || null, reported: "deferred", reason: deferredMsg.slice(0, 300) },
      false,
      true,
    );
    return Response.json({ recorded: "deferred", job });
  }
  if (url.searchParams.get("ok")) {
    await reportCronRun(job, { sha: liveSha || null, reported: "ok" }, false);
    return Response.json({ recorded: "ok", job });
  }
  if (jobParam) {
    return Response.json(
      { error: "job param needs ok=1, deferred=<reason>, or fail=<message>" },
      { status: 400 },
    );
  }

  // Check mode: run the internal smoke tests.
  const checks: Record<string, unknown> = {};
  let hadError = false;

  const tableResults = await Promise.all(CORE_TABLES.map((t) => checkTable(t)));
  CORE_TABLES.forEach((table, i) => {
    const err = tableResults[i];
    if (err) hadError = true;
    checks[`table_${table}`] = err ? { error: err } : "ok";
  });

  try {
    const { projects, degraded } = await listProjectsChecked();
    if (degraded) {
      // Query errored for a non-schema reason and collapsed to the synthetic
      // fallback - a populated multi-tenant install would be silently skipping
      // real tenants. This is the detection the length check alone can't do
      // (the fallback array is never empty). (2026-07-21 audit.)
      hadError = true;
      checks.projects_resolve = { error: `degraded - collapsed to env fallback: ${degraded}` };
    } else if (projects.length === 0) {
      hadError = true;
      checks.projects_resolve = { error: "no projects resolvable (env fallback included)" };
    } else {
      checks.projects_resolve = `ok (${projects.length})`;
    }
  } catch (e) {
    hadError = true;
    checks.projects_resolve = { error: e instanceof Error ? e.message : String(e) };
  }

  // Schema drift: code ships migrations faster than a self-hosted operator
  // applies them. Name the exact missing files here so the gap surfaces as
  // a post-deploy banner + email instead of features that mysteriously
  // never activate (or the projects env-fallback answering for the wrong
  // tenant - the 0027 audit's nastiest silent failure mode).
  const missing = await missingMigrations();
  if (missing.length > 0) {
    hadError = true;
    checks.schema_migrations = {
      error: `missing migration(s): ${missing.join(", ")} - run supabase/migrations/setup.sql (idempotent, safe to re-run) or paste the named files in the Supabase SQL editor`,
    };
  } else {
    checks.schema_migrations = "ok";
  }

  // Creds sanity: a service-account JSON that no longer parses (bad paste,
  // truncated env edit) breaks every GSC feature quietly. Setup-wizard
  // installs use OAuth instead and legitimately have no env here.
  const gscRaw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!gscRaw) {
    // Legitimate only while the service-account path has never produced
    // data. Crons are the sole writer of gsc_stats and they read exclusively
    // through the service account, so any row proves this instance depends
    // on the env - a deploy without it is the 'worked-then-broke' class
    // (2026-07-20: an env edit + redeploy race shipped exactly this, and the
    // old skip here waved it through for the next cron to trip over).
    const { count } = await db()
      .from("gsc_stats")
      .select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) {
      hadError = true;
      checks.gsc_credentials = {
        error:
          "GSC_SERVICE_ACCOUNT_JSON is missing but Search Console data has synced through it before - restore the env var in Vercel project settings and redeploy",
      };
    } else {
      checks.gsc_credentials =
        "skipped (no service-account env; OAuth installs manage theirs in setup)";
    }
  } else {
    try {
      const parsed = JSON.parse(gscRaw) as Record<string, unknown>;
      if (typeof parsed.client_email === "string" && typeof parsed.private_key === "string") {
        checks.gsc_credentials = "ok";
      } else {
        hadError = true;
        checks.gsc_credentials = { error: "service-account JSON missing client_email/private_key" };
      }
    } catch {
      hadError = true;
      checks.gsc_credentials = { error: "GSC_SERVICE_ACCOUNT_JSON is not valid JSON" };
    }
  }

  // Billing config: in CLOUD_MODE every plan gate (remainingSites,
  // planGate) fails OPEN when POLAR_ACCESS_TOKEN is unset -
  // so a cloud deploy that forgot the token silently grants every account
  // unlimited sites, burning DataForSEO spend with no cap. That
  // fail-open is deliberate for self-host, but in cloud it's a misconfiguration
  // that must scream, not shrug. Self-host (CLOUD_MODE off) is always fine.
  if (isCloudMode() && !polarConfigured()) {
    hadError = true;
    checks.billing_config = {
      error:
        "CLOUD_MODE is on but POLAR_ACCESS_TOKEN is unset - all plan limits are failing open (unlimited sites for every account). Set POLAR_ACCESS_TOKEN in Vercel project settings and redeploy",
    };
  } else {
    checks.billing_config = isCloudMode() ? "ok" : "skipped (self-host)";
  }

  // GitHub App config: in CLOUD_MODE every repo connect/dispatch/merge/secret
  // call runs through installationToken(), which needs GITHUB_APP_ID and a
  // parseable GITHUB_APP_PRIVATE_KEY to even sign the app-level JWT. This had
  // no canary at all - unlike billing_config above, a broken key degraded
  // silently: each project's dispatch/merge call swallowed the failure into
  // its own generic "no token connected" message, with nothing attributing
  // the outage to auth (2026-07-27 audit). appJwt() actually signs, so this
  // also catches a malformed key the line-wrap paste gotcha can produce, not
  // just a missing env var.
  if (isCloudMode()) {
    if (
      !process.env.GITHUB_APP_ID ||
      !process.env.GITHUB_APP_PRIVATE_KEY ||
      !process.env.GITHUB_APP_WEBHOOK_SECRET
    ) {
      hadError = true;
      checks.github_app_config = {
        error:
          "CLOUD_MODE is on but GITHUB_APP_ID/GITHUB_APP_PRIVATE_KEY/GITHUB_APP_WEBHOOK_SECRET is unset - every project's GitHub connect/dispatch/merge will fail. Set them in Vercel project settings and redeploy",
      };
    } else {
      try {
        appJwt();
        // The install-claim proof (github-app.ts callerControlsInstallation)
        // only runs when both client credentials are present, and falls back to
        // the weaker freshness heuristic when they are not - a downgrade that
        // is invisible from the outside. In cloud that is a security control
        // quietly switching itself off, so it alarms rather than shrugs.
        if (!process.env.GITHUB_APP_CLIENT_ID || !process.env.GITHUB_APP_CLIENT_SECRET) {
          hadError = true;
          checks.github_app_config = {
            error:
              "GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET are unset, so GitHub App install claims fall back to the freshness heuristic and are NOT verified against the installer's own account. Set both in Vercel project settings and redeploy (the App also needs 'Request user authorization (OAuth) during installation' enabled)",
          };
        } else {
          checks.github_app_config = "ok";
        }
      } catch (e) {
        hadError = true;
        checks.github_app_config = {
          error: `GITHUB_APP_PRIVATE_KEY failed to sign a JWT (${e instanceof Error ? e.message : String(e)}) - it is likely malformed (check for the line-wrap paste gotcha). Every project's GitHub connect/dispatch/merge will fail`,
        };
      }
    }
  } else {
    checks.github_app_config = "skipped (self-host)";
  }

  // This deploy is live and just self-checked - the exact moment a new
  // pipeline pack (if this deploy carries one) should reach every installed
  // repo, instead of each repo discovering it at its own daily version check
  // up to 24h later while its workflows keep failing on the bug the pack
  // already fixes (2026-08-02, maxpertise). No-op when every repo is current;
  // fire-and-forget so the smoke-test response stays instant.
  if (isCloudMode()) {
    after(async () => {
      try {
        const { reconcileStalePacks } = await import("@/lib/pipeline-install");
        await reconcileStalePacks();
      } catch (e) {
        console.error("[deploy-check] pack reconcile sweep failed:", e);
      }
    });
  }

  const result = { sha: liveSha || null, checks };
  console.log("[deploy-check]", JSON.stringify(result));
  await reportCronRun("deploy-check", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
