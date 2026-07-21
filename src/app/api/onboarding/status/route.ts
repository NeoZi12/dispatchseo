import { cookies } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { isValidCookie, instanceSettings } from "@/lib/dashboard-auth";
import { getProjectBySlug } from "@/lib/projects";
import { getCronHealth, reportCronRun } from "@/lib/cron-alerts";
import { backendBaseUrl } from "@/lib/pipeline-pack";

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
  const base = await backendBaseUrl();
  try {
    await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(55_000),
    });
  } catch {
    // Best-effort: the scheduled run covers whatever this one missed.
  }
}

export async function GET(req: Request): Promise<Response> {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return Response.json({ error: "slug required" }, { status: 400 });
  const project = await getProjectBySlug(slug);
  if (!project) return Response.json({ error: "unknown project" }, { status: 404 });

  const [keywords, rankChecks, suggestions, pages, gscRows, health, profile] = await Promise.all([
    db().from("keywords").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("rank_checks").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("suggestions").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("pages").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    db().from("gsc_stats").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    getCronHealth(project.slug),
    db().from("site_profile").select("id", { count: "exact", head: true }),
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

  return Response.json({
    repo_connected: Boolean(project.pipeline_installed_at) || Boolean(canary),
    canary_ok: canary?.ok ?? null, // null = hasn't run yet
    canary_error: canary && !canary.ok ? (canary.errors[0] ?? null) : null,
    pipeline_installed: Boolean(project.pipeline_installed_at),
    // The backlink playbook's "agent wrote the site profile" signal - lets
    // the wizard finale watch that paste complete live, like everything else.
    profile_written: (profile.count ?? 0) > 0,
    ideas_queued: suggestions.count ?? 0,
    keywords_tracked: keywordCount,
    rank_checks: rankCount,
    gsc_rows: gscCount,
    pages_known: pages.count ?? 0,
  });
}
