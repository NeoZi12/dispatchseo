import { cache } from "react";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";
import { outsidePool, ownerUserIdForProject, polarConfigured, projectHint, projectPlan, readOwnedSites, writerGate, type ProjectPlan } from "@/lib/billing";
import { writerMode, type Project } from "@/lib/projects";
import { missingCredentials } from "@/lib/writer/models";
import { catchUpPace, monthGateVerdict, type MonthGateReason } from "@/lib/site-shares-core";
import { cadence, monthStartUtc, nextMonthStartUtc, weekStartUtc, spacingDaysFor } from "./math";
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
//
// The same rows counted since any date (monthAllowance counts the month with
// it) for the site's quota bucket.
export const weekUsageSince = cache(async (projectId: string, since: string): Promise<WeekUsage> => {
  try {
    return await usageFor(await quotaBucket(projectId), since);
  } catch (e) {
    return { ...ZERO, readError: e instanceof Error ? e.message : String(e) };
  }
});

/** weekUsageSince's count for any list of project ids - the owner's whole
 *  account for the month gate. Never throws: a read error comes back as
 *  `readError` with zeros. */
export async function usageFor(ids: string[], since: string): Promise<WeekUsage> {
  if (!ids.length) return { ...ZERO };
  try {
    const [draftsRes, runsRes, lastRunsRes, lastDraftRes] = await Promise.all([
      db()
        .from("article_drafts")
        .select("status")
        .in("project_id", ids)
        .eq("client_kind", CLIENT_KIND)
        .gte("created_at", since)
        // An article the owner dropped ("Don't publish", a discard, a pull
        // request closed without merging) still counts: it was written, and
        // handing the slot back let a review-mode owner read each finished
        // article, drop it, and get another - three times a plan's articles
        // for the price of one (audit, 2026-11-11). Only a draft our own
        // quality gate turned down ("rejected") is not the owner's article.
        .neq("status", "rejected"),
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
}

/** What an owner's DELETED sites already used this month (migration 0090,
 *  written by site-shares.ts recordDeletedSiteCarry). A DB that hasn't run
 *  0090 has no carry to read: zeros, never an error. */
export async function ownerMonthCarry(ownerId: string, monthStart: Date): Promise<{ articleStarts: number; dfsMicrousd: number; readError?: string }> {
  const { data, error } = await db()
    .from("owner_month_carry")
    .select("article_starts, dfs_microusd")
    .eq("owner_user_id", ownerId)
    .eq("month", monthStart.toISOString().slice(0, 10))
    .maybeSingle();
  if (error) {
    if (/does not exist|could not find|PGRST205|42P01/i.test(error.message)) return { articleStarts: 0, dfsMicrousd: 0 };
    return { articleStarts: 0, dfsMicrousd: 0, readError: error.message };
  }
  const row = data as { article_starts: number | null; dfs_microusd: number | string | null } | null;
  return { articleStarts: Number(row?.article_starts ?? 0), dfsMicrousd: Number(row?.dfs_microusd ?? 0) };
}

export type MonthUsage = {
  /** This site's articles this calendar month (its quota bucket). */
  siteCount: number;
  /** The owner's articles this month across every site in the pool, plus
   *  what deleted sites already used (owner_month_carry). */
  ownerCount: number;
};

/** The month's counts the month gate compares. Null owner = no pool. */
export async function monthUsage(projectId: string, ownerId: string, now: Date): Promise<MonthUsage | { readError: string }> {
  const start = monthStartUtc(now);
  const since = start.toISOString();
  const owned = await readOwnedSites(ownerId);
  if (owned.error) return { readError: owned.error };
  // Sites on the operator's per-site override run outside the pool and are
  // not counted against it (billing.ts outsidePool).
  const ids = owned.rows.filter((r) => !outsidePool(r)).map((r) => r.id);
  const [site, owner, carry] = await Promise.all([weekUsageSince(projectId, since), usageFor(ids, since), ownerMonthCarry(ownerId, start)]);
  const readError = site.readError ?? owner.readError ?? carry.readError;
  if (readError) return { readError };
  return { siteCount: site.count, ownerCount: owner.count + carry.articleStarts };
}

export type MonthAllowance =
  | { reason: MonthGateReason; nextAt: Date; share: number; pool: number }
  | { readError: string };

/**
 * The month gate (multi-site plans): has this site used its share of the
 * owner's monthly pool, or the owner the whole pool across their sites?
 * null = yes, an article may start (the week's ramp, quota and spacing still
 * apply after it). Only a plan with a pool is gated here: self-host,
 * unbilled and the operator's override have none, and the free tier has its
 * own durable ledger. A read error refuses, like weekUsage's readError: a
 * month that could not be counted must not read as an empty one.
 */
export async function monthAllowance(
  project: Pick<Project, "id"> & { owner_user_id?: string | null },
  plan: Pick<ProjectPlan, "articlesPerMonth" | "poolPerMonth">,
  now: Date,
): Promise<MonthAllowance | null> {
  return (await monthAllowanceWithCount(project, plan, now)).gate;
}

/** monthAllowance, plus the site's own count for the month when it was
 *  read (null with no pool or on a read error): what paceToday needs, from
 *  the one read. */
export async function monthAllowanceWithCount(
  project: Pick<Project, "id"> & { owner_user_id?: string | null },
  plan: Pick<ProjectPlan, "articlesPerMonth" | "poolPerMonth">,
  now: Date,
): Promise<{ gate: MonthAllowance | null; siteCount: number | null }> {
  if (plan.articlesPerMonth == null || plan.poolPerMonth == null) return { gate: null, siteCount: null };
  const ownerId = project.owner_user_id ?? (await ownerUserIdForProject(project.id));
  if (!ownerId) return { gate: null, siteCount: null };
  const usage = await monthUsage(project.id, ownerId, now);
  if ("readError" in usage) return { gate: { readError: usage.readError }, siteCount: null };
  const reason = monthGateVerdict({ share: plan.articlesPerMonth, pool: plan.poolPerMonth, ...usage });
  return {
    gate: reason ? { reason, nextAt: nextMonthStartUtc(now), share: plan.articlesPerMonth, pool: plan.poolPerMonth } : null,
    siteCount: usage.siteCount,
  };
}

/** The week's quota and the days between starts to give cadence() today. A
 *  pooled site that is behind on its month may start sooner than its plan's
 *  even spacing, so a skipped day does not cost the owner an article
 *  (site-shares-core catchUpPace). Everything without a pool - free,
 *  self-host, the operator's override - passes through unchanged. */
export function paceToday(
  plan: Pick<ProjectPlan, "articlesPerMonth" | "poolPerMonth" | "spacingDays">,
  quota: number,
  siteCount: number | null,
  now: Date,
): { quota: number; spacingDays: number | undefined } {
  if (plan.poolPerMonth == null || plan.articlesPerMonth == null || siteCount == null || plan.spacingDays == null) return { quota, spacingDays: plan.spacingDays };
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return catchUpPace({ share: plan.articlesPerMonth, used: siteCount, dayOfMonth: now.getUTCDate(), daysInMonth, spacingDays: plan.spacingDays, quota });
}

/** When the site's plan (its owner's sites, its share) could not be read:
 *  a refusal for now, never "your plan isn't active" and never a share of 0.
 *  autopilot-actions.ts retryArticle says the same. */
export const PLAN_READ_ERROR = "This site's plan could not be read just now, so no article starts until it can; try again in a minute.";

/** The owner-facing sentence for a month-gate refusal. writerStartGate
 *  returns it, and autopilot-actions.ts ownerRefusal passes both shapes
 *  through by their opening words ("This site has used its", "Your plan's"). */
export function monthGateSentence(m: { reason: MonthGateReason; nextAt: Date; share: number; pool: number }): string {
  const when = ` The next one can start ${m.nextAt.toISOString().slice(0, 10)}.`;
  return m.reason === "share used"
    ? `This site has used its ${m.share} article${m.share === 1 ? "" : "s"} for this month.${when}`
    : `Your plan's ${m.pool} articles for this month are used across your sites.${when}`;
}

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
  if (project.writer_paused_at) return "The Dispatcher is paused for this site. Resume it first.";
  const missing = missingCredentials();
  if (missing.length) return `The hosted writer has no model credentials on this deploy (${missing.join("; ")}).`;
  const ceiling = await spendCeilingReason(project.id, now);
  if (ceiling) return ceiling;
  if (isCloudMode()) {
    if (!polarConfigured()) return "plan inactive: billing is not configured on this deploy, so no article can be started.";
    const gate = await writerGate(project.id);
    // "could not read" is a blip, not a lapsed plan (billing.ts planGate).
    if (!gate.allowed) return gate.reason.startsWith("could not read") ? PLAN_READ_ERROR : `plan inactive: ${gate.reason}.`;
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
  if (plan.readError) return PLAN_READ_ERROR;
  // A covered paid site whose share of the pool is 0 this month (the owner
  // gave the pool to other sites by hand, or the ramp holds it): not a
  // lapsed plan, so it must not read as one.
  if (isCloudMode() && plan.poolPerMonth != null && plan.articlesPerMonth === 0) {
    return `This site gets none of your plan's ${plan.poolPerMonth} articles this month. Change how they're split between your sites in Settings.`;
  }
  if (isCloudMode() && plan.articlesPerWeek === 0) return "plan inactive: this site's plan includes no articles right now.";
  if (writerMode(project) === "hosted" && !opts.gated) {
    const usage = await weekUsage(project.id, now);
    if (usage.readError) return `This week's usage could not be read (${usage.readError}), so no article starts until it can; try again in a minute.`;
    const ramp = await rampFor(project.id, plan, now);
    if (ramp.stage === "pause") return `This site is held: ${ramp.reason}.`;
    // The month before the week: the share and the pool are the plan's
    // numbers, the week's quota and spacing only pace them.
    const { gate: month, siteCount } = await monthAllowanceWithCount(project, plan, now);
    if (month && "readError" in month) return `This month's usage could not be read (${month.readError}), so no article starts until it can; try again in a minute.`;
    if (month) return monthGateSentence(month);
    const pace = paceToday(plan, ramp.quota, siteCount, now);
    const verdict = cadence({ now, quota: pace.quota, spacingDays: pace.spacingDays, countThisWeek: usage.count, lastStartedAt: usage.lastStartedAt });
    const spacing = pace.spacingDays ?? spacingDaysFor(plan.articlesPerWeek);
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
