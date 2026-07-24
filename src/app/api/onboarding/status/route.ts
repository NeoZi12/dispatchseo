import { after } from "next/server";
import { db } from "@/lib/db";
import { instanceSettings } from "@/lib/dashboard-auth";
import { dashboardAuth } from "@/lib/auth-gate";
import { getProjectBySlug } from "@/lib/projects";
import { getCronHealth, reportCronRun } from "@/lib/cron-alerts";
import { buildsActive } from "@/lib/builder-status";
import { backendBaseUrl } from "@/lib/pipeline-pack";
import { openSeoPrs, dispatchResearch } from "@/lib/github";
import { ownedProjectIds } from "@/lib/tenant-guard";

// The open install PR, so the wizard can say "your move: merge this" with a
// link instead of waiting silently. Cached 60s per repo: the wizard polls
// every 6s and GitHub's unauthenticated rate limit is 60/hr.
let prCache: { repo: string; at: number; pr: { url: string; title: string } | null } | null = null;

async function openInstallPr(project: {
  github_repo: string | null;
  github_installation_id?: number | null;
}): Promise<{ url: string; title: string } | null> {
  const repo = project.github_repo;
  if (!repo) return null;
  if (prCache && prCache.repo === repo && Date.now() - prCache.at < 60_000) return prCache.pr;
  // live: the wizard is waiting for the install PR to APPEAR - the 60s SWR
  // cache in openSeoPrs would stack on prCache above and delay that moment
  // to ~2-3 minutes. prCache alone already bounds this to 1 call/min/repo.
  const prs = await openSeoPrs(project, { live: true });
  const pr = prs[0] ? { url: prs[0].html_url, title: prs[0].title } : null;
  prCache = { repo, at: Date.now(), pr };
  return pr;
}

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

  const [keywords, rankChecks, suggestions, pages, gscRows, health, profile] = await Promise.all([
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
  ]);

  const canary = health.find((h) => h.job === `seo-canary--${project.slug}`);
  const keywordCount = keywords.count ?? 0;
  const rankCount = rankChecks.count ?? 0;
  const gscCount = gscRows.count ?? 0;

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
  // On a LOCAL docker backend GitHub Actions can't reach us, so seo-weekly-
  // research is disabled and this repository_dispatch would fire a doomed run
  // (or silently no-op against a disabled workflow). The in-stack builder
  // claims the research job on its own poll instead - so skip the dispatch
  // there. Same guard shape as cron-alerts.ts's IS_DOCKER_STACK localhost check.
  const localDockerBackend =
    Boolean(process.env.POSTGREST_URL) &&
    ((process.env.APP_URL ?? "").includes("localhost") ||
      (process.env.APP_URL ?? "").includes("127.0.0.1"));
  if (
    project.pipeline_installed_at &&
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
  const openPr = project.pipeline_installed_at
    ? null
    : await openInstallPr(project);

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
    repo_connected: Boolean(project.pipeline_installed_at) || Boolean(canary),
    canary_ok: canary?.ok ?? null, // null = hasn't run yet
    canary_error: canary && !canary.ok ? (canary.errors[0] ?? null) : null,
    pipeline_installed: Boolean(project.pipeline_installed_at),
    // The install's last step kicks off the first research run (the agent
    // dispatches it, or runs it in-session on localhost backends). If the
    // queue is still empty well past that promise, Home's background strip
    // switches from "nothing to do" to an actionable nudge instead of
    // spinning forever on a run that never started.
    research_overdue: Boolean(
      project.pipeline_installed_at &&
        (suggestions.count ?? 0) === 0 &&
        Date.now() - new Date(project.pipeline_installed_at).getTime() > 30 * 60_000,
    ),
    open_pr: openPr,
    // The backlink playbook's "agent wrote the site profile" signal - lets
    // the wizard finale watch that paste complete live, like everything else.
    profile_written: (profile.count ?? 0) > 0,
    ideas_queued: suggestions.count ?? 0,
    keywords_tracked: keywordCount,
    rank_checks: rankCount,
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
