import type { Project } from "@/lib/projects";
import { writerMode } from "@/lib/projects";
import { isDryRun } from "@/lib/writer/models";
import { evaluateAutoPause } from "./pause";
import { RESEARCH_EVERY_MS, runResearch, type ResearchOutcome } from "./research";
import { runScheduler, type SchedulerOutcome } from "./scheduler";
import { reportSiteHealth, siteHealthProblems } from "./health";
import { reprobeRewriteWeekly } from "@/lib/hosted-rewrite";
import { db } from "@/lib/db";
import { projectPlan } from "@/lib/billing";

/** Fewer approved guide ideas than the plan writes in a week. A read error
 *  says "not short": research then waits for its weekly turn as before. */
async function queueShort(project: Project, now: Date): Promise<boolean> {
  void now;
  const [{ count, error }, plan] = await Promise.all([
    db().from("suggestions").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("type", "guide").eq("status", "approved"),
    projectPlan(project.id),
  ]);
  if (error || plan.articlesPerWeek <= 0) return false;
  return (count ?? 0) < plan.articlesPerWeek;
}

// The autopilot (2026-10-23 pivot): a hosted project's research, cadence and
// brakes, with no agent anywhere. One daily pass per project, run by
// /api/cron/autopilot:
//
//   1. pause.ts      should this site stop? (GSC collapse, zero-impression
//                    streak) - checked first, because a paused site does
//                    nothing else
//   2. research.ts   top the idea queue up to six, weekly (or on the first run)
//   3. scheduler.ts  start today's article if the plan's weekly quota and the
//                    spacing between articles allow it
//   4. health.ts     make lasting trouble loud (autopilot--<slug>)
//
// profile.ts writes the site profile from the crawl; report.ts is the
// dashboard's (and get_autopilot's) read model; controls.ts holds every
// owner control; usage.ts holds the start gate every writer run passes. See
// src/content/docs/autopilot.mdx for the owner's version.

export { getAutopilotReport, type AutopilotReport, type AutopilotArticle, type AutopilotArticleStatus } from "./report";
export { evaluateAutoPause, pauseWriter, resumeWriter } from "./pause";
export { runResearch, RESEARCH_EVERY_MS } from "./research";
export { runScheduler } from "./scheduler";
export { generateSiteProfile } from "./profile";
export { writerStartGate, weekUsage } from "./usage";
export * from "./controls";

export type AutopilotPass = {
  skipped?: string;
  pause?: { paused: boolean; reason?: string };
  research?: ResearchOutcome | { error: string };
  scheduler?: SchedulerOutcome;
  health?: string[];
  /** A real fault happened in a stage that did not stop the pass. */
  hadError?: boolean;
};

export async function runAutopilotPass(project: Project, now = new Date()): Promise<AutopilotPass> {
  if (writerMode(project) !== "hosted") return { skipped: "not a hosted project" };
  // A dry-run deploy answers every model call with canned text. Its articles
  // and "approved" ideas must never reach a real customer's site, so the
  // daily pass does nothing at all there (the smoke test drives write_article
  // by hand instead).
  if (isDryRun()) return { skipped: "dry run" };
  const pause = await evaluateAutoPause(project, now);
  if (pause.paused) {
    await reportSiteHealth(project, []);
    return { pause };
  }

  // Research failing (DataForSEO down for every seed) must not cost today's
  // article: the queue usually still holds ideas. It is reported, loudly, and
  // the scheduler runs anyway.
  let research: ResearchOutcome | { error: string } | undefined;
  const stale = !project.last_research_at || now.getTime() - Date.parse(project.last_research_at) >= RESEARCH_EVERY_MS;
  // Weekly, or sooner when the queue holds less than a week of articles: at
  // five a week, two queued ideas on a Saturday ran dry by Tuesday while the
  // next research sat six days out. runResearch itself tops up to the
  // plan's target and stamps the date, so an early run just moves the clock.
  const short = stale ? false : await queueShort(project, now);
  if (stale || short) {
    try {
      research = await runResearch(project, now);
    } catch (e) {
      research = { error: `research: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  // The hosted blog's forwarding rule, re-checked weekly (hosted-rewrite.ts):
  // a rule the owner removed must not keep reading as live forever. Never
  // fatal - a probe that throws leaves the stamp as it was.
  await reprobeRewriteWeekly(project, now).catch(() => null);

  const researched = Boolean(research && !("skipped" in research));
  const scheduler = await runScheduler(project, now, { researchedThisRun: researched });

  const skips = [
    research && "skipped" in research ? research.skipped : "",
    "skipped" in scheduler ? scheduler.skipped : "",
    "skipped" in scheduler && scheduler.research && "skipped" in scheduler.research ? scheduler.research.skipped : "",
  ].filter(Boolean);
  const health = await siteHealthProblems(project, skips, now);
  await reportSiteHealth(project, health);

  return { pause, research, scheduler, ...(health.length ? { health } : {}), ...(research && "error" in research ? { hadError: true } : {}) };
}
