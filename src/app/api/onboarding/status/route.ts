import { after } from "next/server";
import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/dashboard-auth";
import { dashboardAuth } from "@/lib/auth-gate";
import { getProjectBySlug } from "@/lib/projects";
import { getCronHealth, reportCronRun } from "@/lib/cron-alerts";
import { buildsActive, inStackBuilderOwnsBuilds } from "@/lib/builder-status";
import { backendBaseUrl, hasDataforseo } from "@/lib/pipeline-pack";
import { dispatchResearch } from "@/lib/github";
import { openInstallPr } from "@/lib/install-pr";
import { ownedProjectIds } from "@/lib/tenant-guard";
import { isCloudMode, isLocalBackendUrl } from "@/lib/cloud";
import { reconcileInstallStamp } from "@/lib/install-reconcile";

// The onboarding wizard's live finale polls this while the owner runs the
// terminal setup command: it reports how far the repo connection and the
// first data runs have come, so the wizard can flip steps green in real
// time instead of dead-ending at "paste this command, good luck".
//
// It is also the first-run TRIGGER: the moment research has tracked
// keywords but no rank check exists yet, it fires the real daily-ranks cron
// once (self-call with the instance cron secret - the exact code path the
// 04:00 schedule runs, failure isolation and reporting included); same for
// the first GSC snapshot. So a brand-new project's graphs and queue fill
// during onboarding instead of "come back tomorrow".

export const dynamic = "force-dynamic";

async function cronSecret(): Promise<string | null> {
  return process.env.CRON_SECRET ?? (await instanceSettings())?.cron_secret ?? null;
}

// Fire-and-forget self-call to one of our own cron routes. Guarded by the
// caller so it only happens while the corresponding table is still empty;
// a second poll arriving before the first run finishes just triggers a run
// that finds the same work (both crons are idempotent per day).
async function triggerCron(path: string): Promise<void> {
  const secret = await cronSecret();
  if (!secret) return;
  // Self-call our OWN cron route. On the docker stack backendBaseUrl() returns
  // the owner-facing APP_URL (e.g. http://localhost:4005) - the HOST NAT
  // mapping, which the app process CANNOT reach from inside its own container
  // (it listens on 3000). Dial the container-internal address directly there,
  // so the onboarding "instant first run" (first GSC snapshot / rank check)
  // actually fires instead of silently connection-refusing and leaving the
  // dashboard empty until the next scheduled cron (2026-07-24).
  const base = process.env.POSTGREST_URL ? "http://127.0.0.1:3000" : await backendBaseUrl();
  try {
    await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    // Best-effort: the scheduled run covers whatever this one missed - but log
    // it, so a persistently-failing self-call isn't completely invisible.
    console.warn(`[onboarding] first-run self-call to ${path} failed:`, err);
  }
}

export async function GET(req: Request): Promise<Response> {
  if (!(await dashboardAuth())) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });
  const project = await getProjectBySlug(slug);
  if (!project) return Response.json({ error: "unknown project" }, { status: 404 });
  // Cloud: a signed-in session is not enough - the slug must name a project
  // THIS user owns. Without this, any tenant could read another's counts,
  // cron errors, and install PR (and self-trigger their paid crons below) just
  // by guessing a slug. Same generic 404 as an unknown project - never confirm
  // a foreign project exists. ownedProjectIds() is null on self-host (no-op).
  const owned = await ownedProjectIds();
  if (owned && !owned.has(project.id)) {
    return Response.json({ error: "unknown project" }, { status: 404 });
  }

  const [keywords, rankChecks, suggestions, pages, gscRows, health, profile, firstKeyword] = await Promise.all([
    db().from("keywords").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("rank_checks").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("suggestions").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("pages").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("gsc_stats").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    getCronHealth(project.slug),
    db()
      .from("site_profile")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id),
    // Oldest tracked keyword = the clock the first rank check is measured
    // against. daily-ranks runs once a day, so "no rank check yet" is only
    // meaningful once a full cycle has had the chance to run.
    db()
      .from("keywords")
      .select("created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const canary = health.find((h) => h.job === `seo-canary--${project.slug}`);
  const keywordCount = keywords.count ?? 0;
  const rankCount = rankChecks.count ?? 0;
  const gscCount = gscRows.count ?? 0;
  const firstKeywordAt = (firstKeyword.data as { created_at?: string } | null)?.created_at ?? null;

  // Self-heal the install stamp before anything below reads it. The setup
  // agent is supposed to end its run with mark_pipeline_installed, but that
  // call sits at the end of a run the platform doesn't control - when it
  // never lands, the project reads as mid-setup forever while every backend
  // measurement says the install is done. Reconcile from evidence instead;
  // a "blocked" verdict carries the owner-facing fixes (typically the
  // Actions create-and-approve-PRs toggle) for the finale to surface.
  let pipelineInstalledAt = project.pipeline_installed_at;
  let installBlocked: string[] | null = null;
  if (!pipelineInstalledAt && project.github_repo) {
    const healed = await reconcileInstallStamp(project);
    if (healed.state === "stamped") pipelineInstalledAt = new Date().toISOString();
    else if (healed.state === "blocked") installBlocked = healed.problems;
  }

  // First-run triggers: real cron code paths, so a failure lands on the
  // same alert rails as any scheduled run. after() keeps the poll response
  // instant while the run continues server-side (a bare fire-and-forget
  // would be killed with the lambda). Debounced through cron_runs: the
  // wizard polls every 6s and a rank run takes up to a minute, so without
  // the marker every poll would stack another full (paid) cron invocation
  // across ALL projects. The marker row also documents the trigger in the
  // same run log everything else uses.
  const recently = (job: string) =>
    health.some(
      (h) => h.job === job && Date.now() - new Date(h.last_run_at).getTime() < 10 * 60_000,
    );
  if (keywordCount > 0 && rankCount === 0 && !recently(`first-run-ranks--${project.slug}`)) {
    await reportCronRun(`first-run-ranks--${project.slug}`, { triggered: "daily-ranks" }, false);
    after(() => triggerCron("/api/cron/daily-ranks"));
  }
  if (project.gsc_site_url && gscCount === 0 && !recently(`first-run-gsc--${project.slug}`)) {
    await reportCronRun(`first-run-gsc--${project.slug}`, { triggered: "hourly-gsc" }, false);
    after(() => triggerCron("/api/cron/hourly-gsc"));
  }
  // First research is the FIRST domino - keywords (and the rank checks that
  // follow) only exist after it runs. The setup run is meant to kick it off,
  // but that leans on the agent remembering to; make it deterministic like
  // ranks/gsc above. Once setup is done and nothing has been researched yet
  // (no keywords, empty queue), fire the research workflow so the dashboard
  // fills itself - no "run /seo-research" for the owner. Needs a repo to
  // dispatch into; debounced through the marker row like the others.
  const suggestionCount = suggestions.count ?? 0;
  // Two reasons to skip the dispatch, and they are different questions - see
  // queue-refill.ts, which holds the same pair. Either the in-stack builder
  // owns the work (it claims research on its own poll, and a dispatch would
  // duplicate the batch and its DataForSEO spend), or GitHub's runners cannot
  // reach this backend at all (localhost/LAN/tailnet), where seo-weekly-
  // research is disabled and the dispatch fires a doomed run.
  const builderOwnsBuilds =
    Boolean(process.env.POSTGREST_URL) && (await inStackBuilderOwnsBuilds());
  const localDockerBackend = builderOwnsBuilds || isLocalBackendUrl(process.env.APP_URL);
  if (
    pipelineInstalledAt &&
    project.github_repo &&
    keywordCount === 0 &&
    suggestionCount === 0 &&
    !localDockerBackend &&
    !recently(`first-run-research--${project.slug}`)
  ) {
    await reportCronRun(`first-run-research--${project.slug}`, { triggered: "seo-research" }, false);
    after(() => dispatchResearch(project));
  }

  // Only look for a PR while the pipeline is still uninstalled - that's the
  // window where "merge it" is the owner's blocking move.
  // openInstallPr answers undefined when GitHub couldn't be asked; this
  // route's contract is {url,title} | null, and "unknown" reads as "none".
  const openPr = pipelineInstalledAt ? null : ((await openInstallPr(project)) ?? null);

  return Response.json({
    // Agent-reported step stamps (mark_install_step) - {} on pre-0036 rows
    // or when the agent predates the tool; the finale's checklist treats
    // absence as "no signal", never as "broken".
    install_progress:
      ((project as { install_progress?: unknown }).install_progress as
        | Record<string, string>
        | undefined) ?? {},
    // Lets the finale checklist name the content-home step honestly:
    // "create" = the agent scaffolds a blog from scratch (the step that
    // stretches installs toward an hour), "existing"/"detect" are quick.
    content_mode:
      ((project as { content_mode?: unknown }).content_mode as string | undefined) ?? null,
    repo_connected: Boolean(pipelineInstalledAt) || Boolean(canary),
    canary_ok: canary?.ok ?? null, // null = hasn't run yet
    canary_error: canary && !canary.ok ? (canary.errors[0] ?? null) : null,
    pipeline_installed: Boolean(pipelineInstalledAt),
    // Owner-facing blockers from the self-heal verify (null = none known).
    // The finale renders these as "your move" - typically the GitHub
    // "Allow Actions to create and approve pull requests" toggle, which the
    // App cannot set itself and which used to be computed and then dropped.
    install_blocked: installBlocked,
    github_repo: project.github_repo,
    // null on pre-0040 rows or when install predates the column - the finale
    // treats that the same as an old agent that never saw verifyPipelinePrereqs,
    // i.e. no signal either way, not a red flag. false is the real distinction:
    // the unlock went through on the agent's word alone (see mark_pipeline_installed).
    pipeline_verified: (project as { pipeline_verified?: boolean | null }).pipeline_verified ?? null,
    // The install's last step kicks off the first research run (the agent
    // dispatches it, or runs it in-session on localhost backends). If the
    // queue is still empty well past that promise, Home's background strip
    // switches from "nothing to do" to an actionable nudge instead of
    // spinning forever on a run that never started.
    research_overdue: Boolean(
      pipelineInstalledAt &&
        (suggestions.count ?? 0) === 0 &&
        Date.now() - new Date(pipelineInstalledAt).getTime() > 30 * 60_000,
    ),
    open_pr: openPr,
    // The backlink playbook's "agent wrote the site profile" signal - lets
    // the wizard finale watch that paste complete live, like everything else.
    profile_written: (profile.count ?? 0) > 0,
    ideas_queued: suggestions.count ?? 0,
    keywords_tracked: keywordCount,
    rank_checks: rankCount,
    // Can this project EVER produce a rank check? Rank tracking is the paid
    // half (DataForSEO); a free/GSC-only project has no rank_checks row coming
    // and never will. The first-run strip waits on rank_checks to hide itself,
    // so without this it spins forever on a free-mode install while promising
    // "rankings fill in on their own" - a permanent in-progress state for work
    // that is not pending, it is not configured.
    ranks_possible: hasDataforseo(project),
    // When the first rank check became overdue: daily-ranks runs once a day,
    // so anything under ~26h from the first tracked keyword is simply "not
    // yet", not a fault. Mirrors research_overdue above.
    ranks_overdue: Boolean(
      keywordCount > 0 &&
        rankCount === 0 &&
        firstKeywordAt &&
        Date.now() - new Date(firstKeywordAt).getTime() > 26 * 3_600_000,
    ),
    gsc_rows: gscCount,
    pages_known: pages.count ?? 0,
    // Docker installs only: is any build path alive - the in-stack builder's
    // heartbeat OR recent builds through the repo's GitHub Actions pipeline.
    // The wizard finale's "automatic builds" row keys off this; false means
    // nothing has built or checked in yet (token not set, container not
    // started, and no workflow builds either).
    is_docker: Boolean(process.env.POSTGREST_URL),
    builds_active: await buildsActive(),
  });
}
