import type { Project } from "@/lib/projects";
import { writerMode } from "@/lib/projects";
import { isDryRun } from "@/lib/writer/models";
import { evaluateAutoPause } from "./pause";
import { promoteBacklog, runResearch, type ResearchOutcome } from "./research";
import { backlogShort, EARLY_RESEARCH_FLOOR_DAYS, earlyResearchAllowed, researchEveryMs } from "./math";
import { readResearchState } from "@/lib/keyword-research-cache";
import { runScheduler, type SchedulerOutcome } from "./scheduler";
import { reportSiteHealth, siteHealthProblems } from "./health";
import { reprobeRewriteWeekly } from "@/lib/hosted-rewrite";
import { db } from "@/lib/db";
import { projectPlan } from "@/lib/billing";
import { DAY_MS } from "./math";

/** The site's live ideas (the visible queue plus the backlog behind it) hold
 *  less than BACKLOG_REFILL_WEEKS of the plan's articles. A read error says
 *  "not short": research then waits for its weekly turn as before. */
async function queueShort(project: Project, now: Date): Promise<boolean> {
  void now;
  const [{ count, error }, plan] = await Promise.all([
    db().from("suggestions").select("id", { count: "exact", head: true }).eq("project_id", project.id).eq("type", "guide").in("status", ["approved", "pending"]),
    projectPlan(project.id),
  ]);
  if (error || plan.articlesPerWeek <= 0) return false;
  return backlogShort(count ?? 0, plan.articlesPerWeek);
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
  /** Ideas promoted from the backlog into the visible queue this pass. */
  promoted?: number;
  health?: string[];
  /** A real fault happened in a stage that did not stop the pass. */
  hadError?: boolean;
};

export type AutopilotPassOptions = {
  /** Runs the scheduler step (the only one that starts an article). The
   *  autopilot cron passes a per-OWNER queue here, so one owner's sites
   *  never read the shared monthly pool as unused in the same instant,
   *  while every other step of every pass still runs in parallel. Absent =
   *  call it directly. */
  schedule?: <T>(fn: () => Promise<T>) => Promise<T>;
};

export async function runAutopilotPass(project: Project, now = new Date(), opts: AutopilotPassOptions = {}): Promise<AutopilotPass> {
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
  // Weekly - or every four weeks on a niche whose last two runs each kept
  // nothing (math.ts researchEveryMs): such a site's weekly run bought the
  // same empty Labs rows again. A read error reads as "still finding
  // things", which is the weekly run as before.
  const researchState = await readResearchState(project.id);
  const stale = !project.last_research_at || now.getTime() - Date.parse(project.last_research_at) >= researchEveryMs(researchState);
  // Weekly, or sooner when the queue holds less than a week of articles: at
  // five a week, two queued ideas on a Saturday ran dry by Tuesday while the
  // next research sat six days out. runResearch itself tops up to the
  // plan's target and stamps the date, so an early run just moves the clock.
  // The early run is floored at EARLY_RESEARCH_FLOOR_DAYS since the last one
  // (two until 2026-11-09, now four): setting ideas aside every morning must
  // not buy keyword data every morning (each run is ~$0.15 of DataForSEO on
  // the platform account). And it only goes ahead while research is still
  // finding things (math.ts earlyResearchAllowed): on a thin niche the judge
  // rejects nearly every candidate, so paperbot's short queue bought ten runs
  // in 30 days for a handful of kept ideas. The regular run is not gated by
  // that; it only slows to four-weekly once the last two runs kept nothing
  // (researchEveryMs above).
  const floorOn =
    !project.last_research_at ||
    now.getTime() - Date.parse(project.last_research_at) >= EARLY_RESEARCH_FLOOR_DAYS * DAY_MS;
  const short =
    stale || !floorOn
      ? false
      : (await queueShort(project, now)) && earlyResearchAllowed(researchState);
  // Research belongs to the morning pass. The later passes of the day
  // (the autopilot cron's 13:30 and 21:30 runs) exist to start an article
  // the morning could not; a research run that FAILED in the morning leaves
  // no date stamped, and running it again twice more the same day re-bought
  // every site's keyword lookups during an outage and spent the shared
  // daily ceiling those afternoon starts need. A site that has never been
  // researched is the exception: it must not wait for tomorrow.
  const retryPass = now.getUTCHours() >= 12 && Boolean(project.last_research_at);
  if ((stale || short) && !retryPass) {
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
  // The visible queue is topped up from the backlog before the writer looks
  // at it, so a drained queue never waits for a research run. Never fatal.
  const promoted = await projectPlan(project.id)
    .then((plan) => promoteBacklog(project.id, plan.articlesPerWeek))
    .catch(() => 0);
  const schedule = () => runScheduler(project, now, { researchedThisRun: researched, retryPass });
  const scheduler = await (opts.schedule ? opts.schedule(schedule) : schedule());

  const skips = [
    research && "skipped" in research ? research.skipped : "",
    "skipped" in scheduler ? scheduler.skipped : "",
    "skipped" in scheduler && scheduler.research && "skipped" in scheduler.research ? scheduler.research.skipped : "",
  ].filter(Boolean);
  const health = await siteHealthProblems(project, skips, now);
  await reportSiteHealth(project, health);

  return { pause, research, scheduler, ...(promoted ? { promoted } : {}), ...(health.length ? { health } : {}), ...(research && "error" in research ? { hadError: true } : {}) };
}
