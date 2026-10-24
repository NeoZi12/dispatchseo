import { db } from "@/lib/db";
import { planGate } from "@/lib/billing";
import { reportCronRun } from "@/lib/cron-alerts";
import type { Project } from "@/lib/projects";
import { consecutivePostPickFailures, FAILURE_STREAK_ALARM, noArticleAlarm } from "./math";
import { BUDGET_SKIP } from "./research";

// When a hosted site's autopilot is quietly not working, the owner has to
// hear about it - but only when it has LASTED. Every daily skip ("no ideas",
// "profile pending", a met quota) is a normal state on its own; these are
// the three patterns that are not:
//
//   failures   two or more runs in a row failed after pick: the pipeline is
//              broken for this site, and every retry is paid for
//   no article an active, unpaused site that finished setup over a week ago
//              and has started nothing in 14 days
//   budget     the shared DataForSEO budget is spent, so research cannot run
//   never live an article rendered and handed to its route 48+ hours ago that
//              is still not live (an unmerged PR, a page that never loads) -
//              urgent on the first pass, because the 48 hours ARE the wait
//
// The problem strings are shown to the owner as written (hosted Home, via
// friendly.ts), so they are plain sentences, never internal error text.
//
// One cron_runs job per site, "autopilot--<slug>", written on EVERY pass
// (ok or failed) so it never reads as stale. A failed row is non-urgent: the
// banner and email wait for a second consecutive failed day (cron-alerts'
// persistence rule), which is the "loud after two days" the budget case
// wants and keeps a one-day blip off the owner's screen.

const CLIENT_KIND = "dispatchseo-writer";

export async function lastArticleStartedAt(projectId: string): Promise<string | null> {
  const { data } = await db()
    .from("writer_runs")
    .select("created_at, status, stage")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  const row = ((data ?? []) as { created_at: string; status: string; stage: string }[]).find((r) => !(r.status === "failed" && r.stage === "pick"));
  return row?.created_at ?? null;
}

/** How long an article may sit accepted/finished (rendered, PR open or post
 *  created) before "it never went live" is worth saying out loud. Long enough
 *  to cover a weekend's unmerged PR on a non-Auto repo and a slow static
 *  build; short enough that a customer is told within two days. */
export const NEVER_LIVE_HOURS = 48;

/** The fragment isUrgentCronFailure keys on for the never-live alarm: the 48
 *  hours already ARE the persistence, so a second day's wait is pointless. */
export const NEVER_LIVE_MARK = "not live after 48 hours";

export async function siteHealthProblems(project: Project, skips: string[], now: Date): Promise<string[]> {
  const problems: string[] = [];
  if (project.writer_paused_at) return problems; // a pause has its own banner
  const gate = await planGate(project.id);
  if (!gate.allowed) return problems; // a lapsed plan is not the pipeline's fault

  const [{ data: runs }, { data: stuck }] = await Promise.all([
    db()
      .from("writer_runs")
      .select("status, stage, error, failure_kind:stage_outputs->>failure_kind")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(10),
    // Never-live: rendered and handed to a route, then nothing for two days.
    db()
      .from("article_drafts")
      .select("title, status, pr_url, pr_merged_at, updated_at")
      .eq("project_id", project.id)
      .eq("client_kind", CLIENT_KIND)
      .in("status", ["accepted", "finished"])
      .lt("updated_at", new Date(now.getTime() - NEVER_LIVE_HOURS * 3_600_000).toISOString())
      .order("updated_at", { ascending: true })
      .limit(5),
  ]);
  const runRows = (runs ?? []) as { status: string; stage: string; error: string | null; failure_kind: string | null }[];
  const streak = consecutivePostPickFailures(runRows);
  if (streak >= FAILURE_STREAK_ALARM) {
    // Written for the owner (the hosted Home shows these lines as they are):
    // an infra streak is ours to fix, a content streak cannot happen (parks
    // are skipped above), anything else is the writer itself failing.
    const recent = runRows.filter((r) => r.status === "failed" && r.stage !== "pick" && r.failure_kind !== "content").slice(0, streak);
    problems.push(
      recent.every((r) => r.failure_kind === "infra")
        ? `the last ${streak} articles were stopped by a problem on our side; they retry by themselves`
        : `the last ${streak} articles stopped before publishing; open Articles to see why`,
    );
  }

  const neverLive = (stuck ?? []) as { title: string; status: string; pr_url: string | null; pr_merged_at: string | null }[];
  if (neverLive.length) {
    const first = neverLive[0];
    const more = neverLive.length > 1 ? ` (and ${neverLive.length - 1} more)` : "";
    problems.push(
      first.pr_url && !first.pr_merged_at
        ? `"${first.title}"${more} is ${NEVER_LIVE_MARK}: its pull request is waiting for a merge on GitHub`
        : `"${first.title}"${more} is ${NEVER_LIVE_MARK}: it went out but the page doesn't load on your site yet`,
    );
  }

  const connectedAt = project.setup_connected_at ?? null;
  if (noArticleAlarm({ connectedAt, lastArticleAt: await lastArticleStartedAt(project.id), now })) {
    const why = skips.find((s) => s && s !== "quota met" && s !== "spacing");
    problems.push(`no article has started in 14 days${why ? ` (${why})` : ""}`);
  }

  if (skips.some((s) => s?.startsWith(BUDGET_SKIP))) {
    problems.push("keyword research is stopped: this month's keyword data budget is used up");
  }
  return problems;
}

export async function reportSiteHealth(project: Project, problems: string[]): Promise<void> {
  await reportCronRun(
    `autopilot--${project.slug}`,
    problems.length ? { error: problems.join("; ") } : { ok: true },
    problems.length > 0,
  );
}
