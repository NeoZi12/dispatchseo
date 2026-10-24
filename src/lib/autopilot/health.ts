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
//
// One cron_runs job per site, "autopilot--<slug>", written on EVERY pass
// (ok or failed) so it never reads as stale. A failed row is non-urgent: the
// banner and email wait for a second consecutive failed day (cron-alerts'
// persistence rule), which is the "loud after two days" the budget case
// wants and keeps a one-day blip off the owner's screen.

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

export async function siteHealthProblems(project: Project, skips: string[], now: Date): Promise<string[]> {
  const problems: string[] = [];
  if (project.writer_paused_at) return problems; // a pause has its own banner
  const gate = await planGate(project.id);
  if (!gate.allowed) return problems; // a lapsed plan is not the pipeline's fault

  const { data: runs } = await db()
    .from("writer_runs")
    .select("status, stage, error")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const runRows = (runs ?? []) as { status: string; stage: string; error: string | null }[];
  const streak = consecutivePostPickFailures(runRows);
  if (streak >= FAILURE_STREAK_ALARM) {
    const last = runRows.find((r) => r.status === "failed" && r.stage !== "pick");
    problems.push(`the last ${streak} articles failed while being written${last?.error ? ` (latest: ${last.error.slice(0, 160)})` : ""}`);
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
