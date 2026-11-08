import { cache } from "react";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";
import { ownerUserIdForProject, polarConfigured, projectHint, projectPlan, writerGate } from "@/lib/billing";
import { writerMode, type Project } from "@/lib/projects";
import { missingCredentials } from "@/lib/writer/models";
import { cadence, weekStartUtc, spacingDaysFor } from "./math";
import { rampFor } from "./ramp";

// What a site has used of its weekly article quota, and the one gate every
// writer start passes (startWriterRun calls writerStartGate - so the MCP
// write_article tool, the dashboard's Retry and the scheduler are all held
// to the same plan, pause, quota and spacing rules; there is no side door).
//
// Kept apart from scheduler.ts on purpose: writer/runs.ts imports this, and
// the scheduler imports runs.ts.

const CLIENT_KIND = "dispatchseo-writer";

export type WeekUsage = {
  /** Set when the rows could not be read: every number below is a
   *  placeholder, and a start gate must refuse rather than count it as
   *  zero (security audit 2026-11-08). Display-only readers may ignore it. */
  readError?: string;
  /** Articles counted against this ISO week's quota. */
  count: number;
  published: number;
  inFlight: number;
  /** Runs this week that failed after pick: they spent real money, so they
   *  use a slot (otherwise a failing pipeline retries all week for free).
   *  Infra failures (ours, not the article's) are excluded. */
  failed: number;
  lastStartedAt: string | null;
};

const ZERO: WeekUsage = { count: 0, published: 0, inFlight: 0, failed: 0, lastStartedAt: null };

/**
 * The projects whose articles share one quota. On cloud that is every project
 * of the same owner on the same domain: deleting a site and adding it again
 * (or adding it twice) must not reset the week. Self-host and ownerless rows
 * are their own bucket. Note: a deleted project's rows are gone (ON DELETE
 * CASCADE), so this closes the duplicate-project hole, not a delete made in
 * the same week; the plan's site count and the daily start cap still bound it.
 */
async function quotaBucket(projectId: string): Promise<string[]> {
  if (!isCloudMode()) return [projectId];
  // The row's owner and domain from the caller's copy when it has one
  // (billing.ts projectHint), else the one-row read.
  const hint = projectHint(projectId);
  let row: { owner_user_id: string | null; domain: string | null } | null;
  if (hint && hint.owner_user_id !== undefined && hint.domain !== undefined) {
    row = { owner_user_id: hint.owner_user_id ?? null, domain: hint.domain ?? null };
  } else {
    const { data: p } = await db().from("projects").select("owner_user_id, domain").eq("id", projectId).maybeSingle();
    row = p as { owner_user_id: string | null; domain: string | null } | null;
  }
  if (!row?.owner_user_id || !row.domain) return [projectId];
  const { data } = await db().from("projects").select("id").eq("owner_user_id", row.owner_user_id).eq("domain", row.domain);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  return ids.includes(projectId) ? ids : [projectId, ...ids];
}

/** Articles counted against this ISO week, and when the last one started.
 *  A read error answers zeros rather than throwing: the dashboard report
 *  renders from this and must not fail on a blip. */
export function weekUsage(projectId: string, now: Date): Promise<WeekUsage> {
  return weekUsageSince(projectId, weekStartUtc(now).toISOString());
}

// Once per request per (project, week): the report and the queue both ask,
// in the same instant, on every hosted page - and each caller's `now` is its
// own Date, so the memo is keyed on the week it resolves to. No request
// scope (the scheduler) means no memo, as before.
const weekUsageSince = cache(async (projectId: string, since: string): Promise<WeekUsage> => {
  try {
    const ids = await quotaBucket(projectId);
    const [draftsRes, runsRes, lastRunsRes, lastDraftRes] = await Promise.all([
      db()
        .from("article_drafts")
        .select("status")
        .in("project_id", ids)
        .eq("client_kind", CLIENT_KIND)
        .gte("created_at", since)
        .not("status", "in", "(rejected,discarded)"),
      // Runs with no draft: still writing (holds a slot), or failed after
      // pick (spent a slot). Runs that produced a draft are counted above.
      db()
        .from("writer_runs")
        .select("status, stage, cost_usd, failure_kind:stage_outputs->>failure_kind, unreadable:stage_outputs->>unreadable_serp")
        .in("project_id", ids)
        .is("draft_id", null)
        .gte("created_at", since),
      // Spacing counts every run that got past pick, failed ones included: a
      // failing pipeline must not start a fresh (paid) run every morning. A
      // run that died AT pick spent next to nothing and must not delay a try.
      db().from("writer_runs").select("created_at, status, stage, cost_usd, failure_kind:stage_outputs->>failure_kind, unreadable:stage_outputs->>unreadable_serp").in("project_id", ids).order("created_at", { ascending: false }).limit(10),
      db()
        .from("article_drafts")
        .select("created_at")
        .in("project_id", ids)
        .eq("client_kind", CLIENT_KIND)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (draftsRes.error || runsRes.error) return { ...ZERO, readError: (draftsRes.error ?? runsRes.error)!.message };
    const drafts = (draftsRes.data ?? []) as { status: string }[];
    const runs = (runsRes.data ?? []) as { status: string; stage: string; cost_usd: number | string | null; failure_kind: string | null; unreadable: string | null }[];
    const published = drafts.filter((d) => d.status === "published").length;
    const running = runs.filter((r) => r.status === "running").length;
    // A run stopped by OUR side (failure_kind "infra": DataForSEO ceiling,
    // a model vendor outage, a stage the queue gave up on) is not the
    // customer's article: charging it to their week meant a vendor outage on
    // Monday cost a Starter site its only article of the week (audit C2).
    // It neither counts against the quota nor delays the next try.
    // A research park because page one could not be read (unreadable_serp,
    // ~$0 spent) is the same kind of non-article: the scheduler hands the
    // slot back, so the week must not count it either, or cadence overrides
    // the returned slot and the site waits anyway.
    // Same predicate as scheduler.ts returnSlotAfterOurFailure, so the slot
    // the scheduler hands back is never re-taken here by a different rule.
    const ours = (r: { status: string; stage: string; cost_usd?: number | string | null; failure_kind: string | null; unreadable?: string | null }) =>
      r.status === "failed" &&
      (r.failure_kind === "infra" || (r.stage === "research" && r.unreadable === "true" && Number(r.cost_usd ?? 0) < 0.01));
    const failed = runs.filter((r) => r.status === "failed" && r.stage !== "pick" && !ours(r)).length;
    const recent = ((lastRunsRes.data ?? []) as { created_at: string; status: string; stage: string; cost_usd: number | string | null; failure_kind: string | null; unreadable: string | null }[]).filter(
      (r) => !(r.status === "failed" && r.stage === "pick") && !ours(r),
    );
    const lastStartedAt =
      [recent[0]?.created_at, (lastDraftRes.data as { created_at: string } | null)?.created_at]
        .filter((x): x is string => Boolean(x))
        .sort()
        .at(-1) ?? null;
    return {
      count: drafts.length + running + failed,
      published,
      inFlight: drafts.length - published + running,
      failed,
      lastStartedAt,
    };
  } catch (e) {
    return { ...ZERO, readError: e instanceof Error ? e.message : String(e) };
  }
});

/**
 * May a writer run start for this project now? null = yes; otherwise the
 * sentence that says why not.
 *
 *   paused          writer_paused_at set (owner or auto-pause)
 *   no keys         the deploy has no model credentials
 *   plan            cloud fails CLOSED: billing not configured, a plan the
 *                   gate does not cover, or a plan that buys 0 articles.
 *                   Self-host has no plan and is not gated here.
 *   quota/spacing   hosted projects only: the weekly quota and the spacing
 *                   between starts (math.ts cadence / spacingDaysFor). `gated` skips ONLY this part,
 *                   for the scheduler, which just evaluated the same rule.
 */
/** Daily model-spend ceilings, per site and for the whole deploy, summed from
 *  the day's writer runs (writer_runs.cost_usd carries every model call of a
 *  run, the 2026-11-03 loop included). The last belt behind the per-run cap
 *  (stages.ts RUN_MAX_USD) and the start caps (runs.ts): a bug that gets
 *  past both still cannot spend more than this in a day. Read errors never
 *  block a start. */
const PROJECT_DAILY_USD = Number(process.env.WRITER_PROJECT_DAILY_USD) || 2;
const PLATFORM_DAILY_USD = Number(process.env.WRITER_PLATFORM_DAILY_USD) || 40;

/** Null when the rows could not be read: the ceiling check refuses then,
 *  because "0 spent" on a DB error is how a start slips past both caps. */
async function runSpendUsd(projectId: string | null, since: Date): Promise<number | null> {
  let q = db().from("writer_runs").select("cost_usd").gte("created_at", since.toISOString());
  if (projectId) q = q.eq("project_id", projectId);
  const { data, error } = await q;
  if (error) return null;
  return ((data ?? []) as { cost_usd: number | string }[]).reduce((a, r) => a + Number(r.cost_usd ?? 0), 0);
}

export async function spendCeilingReason(projectId: string, now = new Date()): Promise<string | null> {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [site, platform] = await Promise.all([runSpendUsd(projectId, dayStart), runSpendUsd(null, dayStart)]);
  if (site === null || platform === null) return "spend ceiling: today's spend could not be read, so no article starts until it can; try again in a minute.";
  if (site >= PROJECT_DAILY_USD) return `spend ceiling: this site's runs already cost $${site.toFixed(2)} today (ceiling $${PROJECT_DAILY_USD}); the next article starts tomorrow.`;
  if (platform >= PLATFORM_DAILY_USD) return `spend ceiling: today's runs on this deploy already cost $${platform.toFixed(2)} (ceiling $${PLATFORM_DAILY_USD}); articles resume tomorrow.`;
  return null;
}

export async function writerStartGate(project: Project, opts: { gated?: boolean } = {}, now = new Date()): Promise<string | null> {
  if (project.writer_paused_at) return "The autopilot is paused for this site. Resume it first.";
  const missing = missingCredentials();
  if (missing.length) return `The hosted writer has no model credentials on this deploy (${missing.join("; ")}).`;
  const ceiling = await spendCeilingReason(project.id, now);
  if (ceiling) return ceiling;
  if (isCloudMode()) {
    if (!polarConfigured()) return "plan inactive: billing is not configured on this deploy, so no article can be started.";
    const gate = await writerGate(project.id);
    if (!gate.allowed) return `plan inactive: ${gate.reason}.`;
    // The free tier's durable ledger (free-gate.ts): starts are counted per
    // OWNER across every site they ever had, so deleting and re-adding a site
    // never resets the month or the spacing. Fails closed.
    if (gate.free) {
      const ownerId = await ownerUserIdForProject(project.id);
      const { freeStartAllowed } = await import("@/lib/free-gate");
      if (!ownerId || !(await freeStartAllowed(ownerId))) return "The free plan's articles for now are used up (2 a month, about two weeks apart). Upgrade for more.";
    }
  }
  const plan = await projectPlan(project.id);
  if (isCloudMode() && plan.articlesPerWeek === 0) return "plan inactive: this site's plan includes no articles right now.";
  if (writerMode(project) === "hosted" && !opts.gated) {
    const usage = await weekUsage(project.id, now);
    if (usage.readError) return `This week's usage could not be read (${usage.readError}), so no article starts until it can; try again in a minute.`;
    const ramp = await rampFor(project.id, plan.articlesPerWeek, now);
    if (ramp.stage === "pause") return `This site is held: ${ramp.reason}.`;
    const verdict = cadence({ now, quota: ramp.quota, spacingDays: plan.spacingDays, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
    const spacing = plan.spacingDays ?? spacingDaysFor(plan.articlesPerWeek);
    if (!verdict.write) {
      const when = verdict.nextAt ? ` The next one can start ${verdict.nextAt.toISOString().slice(0, 10)}.` : "";
      return verdict.reason === "quota met"
        ? `This site has used its ${ramp.quota} article${ramp.quota === 1 ? "" : "s"} for this week${ramp.reason ? ` (${ramp.reason})` : ""}.${when}`
        : verdict.reason === "spacing"
          ? `Articles for one site start at least ${spacing === 1 ? "a day" : `${spacing} days`} apart.${when}`
          : "This site's plan includes no articles right now.";
    }
  }
  return null;
}
