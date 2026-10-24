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
import { keywordDataBlocked, RESEARCH_EVERY_MS, runResearch, type ResearchOutcome } from "./research";
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
    db().from("writer_runs").select("suggestion_id").eq("project_id", projectId).eq("status", "running").not("suggestion_id", "is", null),
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

/** Queue a crawl the way daily-ranks does (dated idempotency key). Not when
 *  a crawl already gave up on this site in the last week: a bot wall or a
 *  login does not lift overnight, and re-reading 150 pages a day into it
 *  only repeats the failure. The Home card asks the owner to describe the
 *  site instead (report.ts siteUnreadable), and the weekly retry stays. */
async function queueCrawl(project: Project, now: Date): Promise<boolean | "walled"> {
  if (!project.domain) return false;
  const { data: last } = await db()
    .from("jobs")
    .select("finished_at, error")
    .eq("project_id", project.id)
    .eq("kind", "crawl")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const gaveUp = last as { finished_at: string | null; error: string | null } | null;
  if (gaveUp?.finished_at && gaveUp.error && now.getTime() - Date.parse(gaveUp.finished_at) < 7 * 86_400_000) return "walled";
  const job = await enqueue({
    projectId: project.id,
    kind: "crawl",
    payload: { isWordPress: publishTarget(project) === "wordpress", maxPages: 150 },
    idempotencyKey: `crawl:${project.id}:${now.toISOString().slice(0, 10)}`,
  });
  return Boolean(job);
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
      const needsCrawl = generated.skipped.includes("crawl digest");
      const queued = needsCrawl ? await queueCrawl(project, now) : false;
      return {
        // Setup, not a fault: quiet, and named so the run log says which.
        skipped: queued === "walled" ? "setup incomplete: we couldn't read the site; the owner can describe it in Settings" : "profile pending",
        profile: { ...generated, crawl_queued: queued === true },
      };
    }
  }

  // A run our side killed (failure_kind "infra") gives its slot back: the
  // claim moved next_article_at two days out, and an outage is not a reason
  // for the customer to wait two more days (audit C2). Only when the newest
  // run is that failure, so a real article in between keeps its spacing.
  await returnSlotAfterInfraFailure(project, now);

  const plan = await projectPlan(project.id);
  const usage = await weekUsage(project.id, now);
  const verdict = cadence({ now, quota: plan.articlesPerWeek, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
  if (!verdict.write) {
    await setNextArticleAt(project.id, verdict.nextAt);
    return { skipped: verdict.reason, next_article_at: verdict.nextAt?.toISOString() ?? null, profile: profileOutcome };
  }

  // The keyword data a run needs, checked BEFORE the slot is claimed. A run
  // started into a spent DataForSEO budget or ceiling dies at research with
  // nothing to read - and used to take the week's slot with it (audit C2/H4).
  const dfsBlocked = await keywordDataBlocked(project);
  if (dfsBlocked) return { skipped: dfsBlocked, next_article_at: project.next_article_at, profile: profileOutcome };

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
    // Two causes, told apart so the run log does not cry "race" for the
    // common one: next_article_at was already in the future when this pass
    // read it (set while the old plan's quota was met - a mid-week upgrade
    // applies from that date, see claimSlot), or another pass really did
    // claim it in between.
    const scheduledAhead = previous != null && Date.parse(previous) > now.getTime();
    return {
      skipped: scheduledAhead
        ? `the next article is already scheduled for ${previous!.slice(0, 10)}; a plan change applies from that date`
        : "another run already claimed today's article",
      research,
      profile: profileOutcome,
    };
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

/** See the call site: hand back the slot a run lost to OUR failure. */
async function returnSlotAfterInfraFailure(project: Project, now: Date): Promise<void> {
  if (!project.next_article_at || Date.parse(project.next_article_at) <= now.getTime()) return;
  const { data } = await db()
    .from("writer_runs")
    .select("status, failure_kind:stage_outputs->>failure_kind")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = data as { status: string; failure_kind: string | null } | null;
  if (last?.status !== "failed" || last.failure_kind !== "infra") return;
  await setNextArticleAt(project.id, now);
  project.next_article_at = now.toISOString();
}

/**
 * A hosted article started by hand (the write_article MCP tool), bound to the
 * same atomic slot as the daily scheduler. writerStartGate checks quota and
 * spacing, but two calls racing both passed it and both started a paid run
 * (audit B12, TOCTOU). Here the slot is claimed with a compare-and-set on the
 * value this call read, so exactly one of any concurrent calls wins; the
 * loser is refused, and a start that fails afterwards gives the slot back.
 */
export async function startHostedRunClaimed(
  project: Project,
  input: { suggestionId?: string | null; keyword?: string | null; titleHint?: string | null },
  now = new Date(),
): Promise<Awaited<ReturnType<typeof startWriterRun>>> {
  const { writerStartGate } = await import("./usage");
  const gated = await writerStartGate(project, {}, now);
  if (gated) return { refused: gated };
  const dfsBlocked = await keywordDataBlocked(project);
  if (dfsBlocked) return { refused: `Not now: ${dfsBlocked}.` };
  const plan = await projectPlan(project.id);
  const usage = await weekUsage(project.id, now);
  const verdict = cadence({ now, quota: plan.articlesPerWeek, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
  if (!verdict.write) return { refused: "This site's next article can't start yet (weekly quota or two-day spacing)." };
  const previous = project.next_article_at;
  let q = db().from("projects").update({ next_article_at: verdict.nextAfter.toISOString() }).eq("id", project.id);
  q = previous ? q.eq("next_article_at", previous) : q.is("next_article_at", null);
  const { data, error } = await q.select("id").maybeSingle();
  if (error) throw new Error(`could not claim the article slot: ${error.message}`);
  if (!data) return { refused: "Another article for this site was started at the same moment. Check get_writer_runs." };
  try {
    const started = await startWriterRun({ projectId: project.id, gated: true, ...input });
    if (!started.run) await setNextArticleAt(project.id, previous ? new Date(previous) : null);
    return started;
  } catch (e) {
    await setNextArticleAt(project.id, previous ? new Date(previous) : null);
    throw e;
  }
}
