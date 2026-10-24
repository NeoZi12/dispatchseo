import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { planGate, projectPlan } from "@/lib/billing";
import { loadSiteProfile } from "@/lib/site-profile";
import { publishRoute } from "@/lib/job-handlers/draft-status";
import { isDryRun, missingCredentials } from "@/lib/writer/models";
import { startWriterRun } from "@/lib/writer/runs";
import { rewriteLiveCached } from "@/lib/hosted-rewrite";
import { publishTarget, writerMode, type Project } from "@/lib/projects";
import { cadence } from "./math";
import { generateSiteProfile } from "./profile";
import { RESEARCH_EVERY_MS, runResearch, type ResearchOutcome } from "./research";
import { weekUsage } from "./usage";

export { weekUsage, type WeekUsage } from "./usage";

// The autopilot's daily decision for one site: write an article today, or say
// why not. Called once a day by /api/cron/autopilot (and on demand by nothing
// else - an owner cannot ask for "one more today", decision 7).
//
// Every "no" is a QUIET skip with a reason ({ skipped }): a paused site, a
// lapsed plan, a site still mid-setup, a met quota, a first article waiting
// for the owner's read are all normal states, and the cron must not turn any
// of them into a red banner. Persistent trouble (no article for two weeks, a
// run of failures) is made loud by health.ts, not here. Only a real fault (a
// DB write failing, startWriterRun throwing) propagates.
//
// The cadence rule lives in math.ts (`cadence`): N articles per ISO week by
// plan, never two within 2 UTC days. startWriterRun enforces the same gate for
// every other caller; this module passes `gated: true` so it is not computed
// twice, after claiming the day's slot atomically (claimSlot).

const CLIENT_KIND = "dispatchseo-writer";

export type SchedulerOutcome =
  | { skipped: string; next_article_at?: string | null; research?: ResearchOutcome; profile?: unknown }
  | { started: string; keyword: string | null; next_article_at: string; research?: ResearchOutcome; profile?: unknown };

/** Approved guide ideas no run is working on. Counted as "approved ids not
 *  in the busy set" - the busy set can hold ideas already moved to
 *  in_progress, so subtracting its size would double-count them. */
export async function approvedIdeaCount(projectId: string): Promise<number> {
  const [{ data: rows }, { data: busy }] = await Promise.all([
    db().from("suggestions").select("id").eq("project_id", projectId).eq("type", "guide").eq("status", "approved").limit(500),
    db().from("writer_runs").select("suggestion_id").eq("project_id", projectId).in("status", ["running", "held"]).not("suggestion_id", "is", null),
  ]);
  const taken = new Set(((busy ?? []) as { suggestion_id: string }[]).map((r) => r.suggestion_id));
  return ((rows ?? []) as { id: string }[]).filter((r) => !taken.has(r.id)).length;
}

async function setNextArticleAt(projectId: string, at: Date | null): Promise<void> {
  const { error } = await db().from("projects").update({ next_article_at: at ? at.toISOString() : null }).eq("id", projectId);
  if (error) console.warn(`[autopilot] next_article_at not saved for ${projectId}: ${error.message}`);
}

/**
 * Claim today's article slot in one conditional write: next_article_at moves
 * to the next allowed start ONLY if it is unset or already due. Two scheduler
 * runs racing (the Vercel cron and a manual trigger, or a retry) cannot both
 * win, so a site never gets two articles from one decision.
 *
 * Trade-off, accepted: next_article_at is also the informational "next
 * article" date, so a mid-week plan upgrade takes effect from the date
 * already shown (usually the following Monday), not instantly.
 */
async function claimSlot(project: Project, now: Date, next: Date): Promise<boolean> {
  const { data, error } = await db()
    .from("projects")
    .update({ next_article_at: next.toISOString() })
    .eq("id", project.id)
    .or(`next_article_at.is.null,next_article_at.lte.${now.toISOString()}`)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not claim today's article slot: ${error.message}`);
  return Boolean(data);
}

/** Queue a crawl the way daily-ranks does (dated idempotency key). */
async function queueCrawl(project: Project, now: Date): Promise<boolean> {
  if (!project.domain) return false;
  const job = await enqueue({
    projectId: project.id,
    kind: "crawl",
    payload: { isWordPress: publishTarget(project) === "wordpress", maxPages: 150 },
    idempotencyKey: `crawl:${project.id}:${now.toISOString().slice(0, 10)}`,
  });
  return Boolean(job);
}

async function hasHeldRun(projectId: string): Promise<boolean> {
  const { count } = await db().from("writer_runs").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "held");
  return (count ?? 0) > 0;
}

async function hasPublishedHostedArticle(projectId: string): Promise<boolean> {
  const { count } = await db()
    .from("article_drafts")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("client_kind", CLIENT_KIND)
    .eq("status", "published");
  return (count ?? 0) > 0;
}

export async function runScheduler(
  project: Project,
  now = new Date(),
  opts: { researchedThisRun?: boolean } = {},
): Promise<SchedulerOutcome> {
  if (writerMode(project) !== "hosted") return { skipped: "not a hosted project" };
  // A dry-run deploy writes canned articles; it must never start one for a
  // real customer from the daily cron (the smoke test uses write_article).
  if (isDryRun()) return { skipped: "dry run" };
  if (project.writer_paused_at) return { skipped: `paused: ${project.writer_pause_reason ?? "by the owner"}`, next_article_at: null };
  const gate = await planGate(project.id);
  if (!gate.allowed) return { skipped: `plan inactive: ${gate.reason}` };
  // Setup first (CLAUDE.md: crons never run what setup hasn't finished). An
  // article with nowhere to go would only pile up as blocked_setup and eat
  // the week's quota before the owner connected anything.
  if (publishRoute(project) === "blocked") return { skipped: "setup incomplete: nowhere to publish yet" };
  // Operator configuration, not the owner's: reported once per cron run by
  // the route (loudly), skipped quietly per project here.
  if (missingCredentials().length) return { skipped: "the writer has no model credentials on this deploy" };
  // A held first article waits for the owner's read; writing more on top of
  // an article they have not approved yet is exactly what holding prevents.
  if (await hasHeldRun(project.id)) return { skipped: "waiting for you to read the first article" };
  // The hosted blog: the FIRST article may go out before /blog forwards (it
  // is how the owner sees the blog at all). After that, more pages on an
  // address nobody can reach from the site is spend with no return.
  if (publishTarget(project) === "hosted" && !project.hosted_rewrite_live_at && (await hasPublishedHostedArticle(project.id))) {
    const live = await rewriteLiveCached(project).catch(() => false);
    if (!live) return { skipped: "setup incomplete: your /blog isn't forwarding yet" };
  }

  // The profile: research seeds from it and the writer judges topics against
  // it. Written from the crawl digest; no digest yet means read the site first.
  // A READ ERROR is not "no profile": regenerating on a blip would overwrite
  // the real one with a fresh model guess.
  let profileOutcome: unknown;
  const loaded = await loadSiteProfile(project);
  if (loaded.error) return { skipped: `could not read the site profile: ${loaded.error}` };
  if (!loaded.fromDb) {
    const generated = await generateSiteProfile(project);
    profileOutcome = generated;
    if (!("written" in generated)) {
      // Only a missing digest is cured by reading the site; a thin model
      // answer is retried tomorrow without re-crawling 150 pages.
      const queued = generated.skipped.includes("crawl digest") ? await queueCrawl(project, now) : false;
      return { skipped: "profile pending", profile: { ...generated, crawl_queued: queued } };
    }
  }

  const plan = await projectPlan(project.id);
  const usage = await weekUsage(project.id, now);
  const verdict = cadence({ now, quota: plan.articlesPerWeek, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
  if (!verdict.write) {
    await setNextArticleAt(project.id, verdict.nextAt);
    return { skipped: verdict.reason, next_article_at: verdict.nextAt?.toISOString() ?? null, profile: profileOutcome };
  }

  let research: ResearchOutcome | undefined;
  if ((await approvedIdeaCount(project.id)) === 0) {
    // Research that came back empty is not retried daily: the site has run
    // out of winnable keywords for now, and re-buying the same Labs rows
    // changes nothing until the weekly run.
    const recent = project.last_research_at && now.getTime() - Date.parse(project.last_research_at) < RESEARCH_EVERY_MS;
    if (opts.researchedThisRun || recent) {
      return { skipped: "no ideas", next_article_at: null, profile: profileOutcome };
    }
    research = await runResearch(project, now);
    if ((await approvedIdeaCount(project.id)) === 0) {
      return { skipped: "skipped" in research ? `no ideas (${research.skipped})` : "no ideas", research, profile: profileOutcome };
    }
  }

  const previous = project.next_article_at;
  if (!(await claimSlot(project, now, verdict.nextAfter))) {
    return { skipped: "another run already claimed today's article", research, profile: profileOutcome };
  }
  const started = await startWriterRun({ projectId: project.id, gated: true });
  if (!started.run) {
    // Give the slot back: nothing started, so the next run may try again.
    await setNextArticleAt(project.id, previous ? new Date(previous) : null);
    return { skipped: `writer refused: ${started.refused}`, research, profile: profileOutcome };
  }
  return {
    started: started.run.id,
    keyword: started.run.keyword,
    next_article_at: verdict.nextAfter.toISOString(),
    research,
    profile: profileOutcome,
  };
}
