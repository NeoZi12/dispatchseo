import { db } from "./db";
import { isCloudMode } from "./cloud";
import {
  articlesPerMonthFor,
  forgetOwnedSites,
  getSubscription,
  isActive,
  outsidePool,
  polarConfigured,
  projectPlan,
  readOwnedSites,
  sitesLimitOf,
  type Tier,
} from "./billing";
import { getProjectById, type Project } from "./projects";
import { monthStartUtc } from "./autopilot/math";
import { rampInputs, rampSinceDay, rampVerdict } from "./autopilot/ramp";
import { monthUsage, usageFor, weekUsageSince } from "./autopilot/usage";
import { autoShares, customShareLimit, RAMP_PROBE_QUOTA, resolveShares, safeMaxFor, type ShareMode } from "./site-shares-core";

export * from "./site-shares-core";

// Multi-site plans (owner, 2026-11-11): one monthly pool of articles per
// owner, split into a fixed monthly share per covered site. This module is
// the state side - who gets what this month, the owner's hand-set shares,
// and what a deleted site already used. The arithmetic is pure and lives in
// site-shares-core.ts; billing.ts projectPlan turns a stored share into the
// site's pace, and autopilot/usage.ts monthAllowance holds the month.
//
// Dashboard and MCP both call setSiteShare / siteShareReport (the parity
// rule). Adding or removing a SITE is deliberately not here and not on MCP:
// an MCP token is one project's, and letting it create or delete the
// owner's other projects is the privilege escalation billing.ts's header
// keeps checkout off MCP for.

/** An owner's site as the split reads it - fresh from the table, never
 *  through a request memo, because the split is written right after. */
type ShareRow = {
  id: string;
  slug: string;
  domain: string | null;
  monthly_share: number | null;
  share_mode: string | null;
  writer_weekly_quota: number | null;
  created_at: string | null;
  site_launched_at: string | null;
  last_research_at: string | null;
};

async function readShareRows(ownerId: string): Promise<{ rows: ShareRow[]; error: string | null }> {
  const { data, error } = await db()
    .from("projects")
    .select("id, slug, domain, monthly_share, share_mode, writer_weekly_quota, created_at, site_launched_at, last_research_at")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as ShareRow[], error: null };
}

/** The owner's live plan and its pool, or null when there is no pool to
 *  split: self-host, billing unconfigured, or no live subscription. */
async function ownerPool(ownerId: string): Promise<{ tier: Tier; pool: number; sitesLimit: number } | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  const sub = await getSubscription(ownerId);
  if (!isActive(sub)) return null;
  const tier: Tier = sub!.status === "trialing" ? "starter" : sub!.tier;
  return { tier, pool: articlesPerMonthFor(tier), sitesLimit: sitesLimitOf(sub!) };
}

/** The ramp's ceiling for a site as a monthly cap, with its reason. A read
 *  failure is rampVerdict's slowest safe answer (one a week -> 4). */
async function siteSafeMax(projectId: string, now: Date): Promise<{ safeMax: number; reason: string | null }> {
  const verdict = rampVerdict(await rampInputs(projectId, rampSinceDay(now)), RAMP_PROBE_QUOTA, now);
  return { safeMax: safeMaxFor(verdict), reason: verdict.reason };
}

/** No live ideas (approved or waiting in the backlog) after a research run
 *  has happened: research keeps coming back empty for this site. */
async function isDry(row: ShareRow): Promise<boolean> {
  if (!row.last_research_at) return false;
  const { count, error } = await db()
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", row.id)
    .eq("type", "guide")
    .in("status", ["approved", "pending"]);
  if (error) throw new Error(`could not count ${row.slug}'s ideas: ${error.message}`);
  return (count ?? 0) === 0;
}

const isCustomRow = (r: { share_mode: string | null; monthly_share: number | null }) => r.share_mode === "custom" && r.monthly_share != null;

/**
 * Recompute the automatic shares of an owner's covered sites (autoShares)
 * from each site's ramp and backlog, and write the ones that changed.
 * Custom sites are left alone; sites outside coverage are left alone too
 * (planGate already stops them, and their stored share comes back when they
 * are covered again). A no-op without cloud billing or a live plan.
 *
 * Never throws to its caller: the daily cron, a delete and a share change
 * all call it on their way somewhere else. A failure leaves the last shares
 * in place, which is always a valid split (resolveShares clamps it).
 */
export async function rebalanceOwnerShares(
  ownerId: string,
  now = new Date(),
): Promise<{ shares: Record<string, number>; held: number } | null> {
  try {
    const plan = await ownerPool(ownerId);
    if (!plan) return null;
    const { rows, error } = await readShareRows(ownerId);
    if (error) throw new Error(error);
    const covered = rows.slice(0, plan.sitesLimit).filter((r) => !outsidePool(r));
    if (!covered.length) return { shares: {}, held: plan.pool };
    const inputs = await Promise.all(
      covered.map(async (r) => {
        // A custom site keeps its number whatever its ramp says (cadence()
        // still paces it), so only automatic sites need the two reads.
        const custom = isCustomRow(r);
        const [ramp, dry] = custom ? [null, false] : await Promise.all([siteSafeMax(r.id, now), isDry(r)]);
        return {
          id: r.id,
          share_mode: r.share_mode,
          monthly_share: r.monthly_share,
          safeMax: ramp ? ramp.safeMax : Infinity,
          dry,
          order: Date.parse(r.site_launched_at ?? r.created_at ?? "") || 0,
        };
      }),
    );
    // Oldest first by when the SITE launched, else when it joined: the site
    // with the longest history is the one Google trusts with more.
    inputs.sort((a, b) => a.order - b.order);
    const result = autoShares({ pool: plan.pool, sites: inputs });
    const writes = covered.filter((r) => !isCustomRow(r) && result.shares.get(r.id) !== r.monthly_share);
    const failed: string[] = [];
    await Promise.all(
      writes.map(async (r) => {
        // Only while the site is still automatic: an owner's Custom set in
        // the same instant wins.
        const { error: wErr } = await db()
          .from("projects")
          .update({ monthly_share: result.shares.get(r.id) ?? 0 })
          .eq("id", r.id)
          .eq("share_mode", r.share_mode ?? "auto");
        if (wErr) failed.push(`${r.slug}: ${wErr.message}`);
      }),
    );
    if (failed.length) console.warn(`[site-shares] some shares were not saved for owner ${ownerId}: ${failed.join("; ")}`);
    forgetOwnedSites(ownerId);
    return { shares: Object.fromEntries(result.shares), held: result.held };
  } catch (e) {
    console.warn(`[site-shares] rebalance skipped for owner ${ownerId}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export type SetSiteShareInput = { mode: "auto" } | { mode: "custom"; share: number };
export type SetSiteShareResult = { ok: true; mode: ShareMode; share: number | null } | { error: string };

/**
 * The owner's control over one site's share: back to Auto, or a fixed
 * number a month (Custom). Custom is a whole number from 1 to the pool minus
 * what the owner's OTHER covered sites have set by hand; the ramp still caps
 * a custom site's pace (it is the site's safety, not the owner's budget).
 * The caller has already checked that the asker owns `project`.
 */
export async function setSiteShare(
  project: Pick<Project, "id"> & { owner_user_id?: string | null; writer_weekly_quota?: number | null },
  input: SetSiteShareInput,
): Promise<SetSiteShareResult> {
  if (!input || (input.mode !== "auto" && input.mode !== "custom")) return { error: "Pick Auto or Custom." };
  if (!isCloudMode()) return { error: "This install has no plan to split: every site writes at its own pace." };
  if (!polarConfigured()) return { error: "Billing isn't enabled on this deployment, so there is no plan to split between sites." };
  const ownerId = project.owner_user_id ?? null;
  if (!ownerId) return { error: "This site isn't on a plan, so it has no share to set." };
  const plan = await ownerPool(ownerId);
  if (!plan) return { error: "The free plan writes for one site, so there is nothing to split. Upgrade to share a plan's articles between sites." };
  forgetOwnedSites(ownerId);
  const { rows, error } = await readShareRows(ownerId);
  if (error) return { error: "We couldn't read your sites just now. Try again in a moment." };
  const row = rows.find((r) => r.id === project.id);
  if (!row) return { error: "That site isn't on this account." };
  if (outsidePool(row)) return { error: "This site's pace is set by DispatchSEO by hand, so it sits outside your plan's split." };
  const covered = rows.slice(0, plan.sitesLimit).filter((r) => !outsidePool(r));
  if (!covered.some((r) => r.id === project.id)) {
    return { error: "This site isn't covered by your plan right now, so it has no share to set. Upgrade, or remove a site you no longer need." };
  }

  let update: { share_mode: ShareMode; monthly_share?: number };
  if (input.mode === "custom") {
    const others = covered.filter((r) => r.id !== project.id && isCustomRow(r)).reduce((a, r) => a + (r.monthly_share ?? 0), 0);
    const max = customShareLimit(plan.pool, others);
    if (max < 1) {
      return { error: `Your other sites already have all ${plan.pool} of your plan's articles a month set by hand. Set one of them back to Auto first.` };
    }
    const share = input.share;
    if (!Number.isInteger(share) || share < 1 || share > max) {
      return {
        error: `Pick a whole number from 1 to ${max}. Your plan has ${plan.pool} articles a month${others ? `, and your other sites have ${others} of them set by hand` : ""}.`,
      };
    }
    update = { share_mode: "custom", monthly_share: share };
  } else {
    // The number stays until the rebalance below replaces it, so the site
    // never reads as "not allocated" in between.
    update = { share_mode: "auto" };
  }
  const { error: wErr } = await db().from("projects").update(update).eq("id", project.id);
  if (wErr) return { error: "We couldn't save that just now. Try again in a moment." };
  // A site that used its old share has next_article_at stamped on the 1st
  // of next month (the scheduler's 'share used' skip). Left there, a raised
  // share or a switch to Auto would wait for that date; cleared, the next
  // daily pass looks again. Only a date in the future, and safe: every
  // start still passes writerStartGate (month, ramp, week, spacing), so this
  // can never start more than the new share allows. Best effort - a failed
  // clear only means the change takes effect on the stamped date.
  const { error: clearErr } = await db()
    .from("projects")
    .update({ next_article_at: null })
    .eq("id", project.id)
    .gt("next_article_at", new Date().toISOString());
  if (clearErr) console.warn(`[site-shares] next_article_at not cleared for ${project.id}: ${clearErr.message}`);
  const rebalanced = await rebalanceOwnerShares(ownerId);
  forgetOwnedSites(ownerId);
  return {
    ok: true,
    mode: update.share_mode,
    share: update.monthly_share ?? rebalanced?.shares[project.id] ?? row.monthly_share ?? null,
  };
}

export type SiteShareReport = {
  /** The owner's articles a month on their plan; null = no pool (free,
   *  self-host, unbilled, or the operator's per-site override). */
  pool: number | null;
  /** This site's articles this month (projectPlan.articlesPerMonth): its
   *  share of the pool, the free plan's 2, or null with no monthly number. */
  share: number | null;
  mode: ShareMode;
  /** The ramp's monthly cap for this site; null = none (full speed). */
  safeMax: number | null;
  /** Why the ramp limits it, as a sentence; null when it doesn't. */
  reason: string | null;
  /** Articles counted against this site's month so far (published, in
   *  progress, and failed after the topic was picked). */
  usedThisMonth: number;
  /** The same across every site in the owner's pool, plus deleted sites'
   *  carry; null without a pool. */
  ownerUsedThisMonth: number | null;
  /** Pool articles given to no site this month (sites not ready for more). */
  held: number;
  /** Every site of the owner, oldest first. Siblings by slug, domain and
   *  numbers only. */
  sites: Array<{ slug: string; domain: string; share: number | null; mode: ShareMode; covered: boolean; usedThisMonth: number }>;
};

/** One site's month in the owner's plan, for the Websites page and the
 *  get_site_share MCP tool. */
export async function siteShareReport(projectId: string, now = new Date()): Promise<SiteShareReport> {
  const project = await getProjectById(projectId);
  if (!project) throw new Error("unknown project");
  const since = monthStartUtc(now).toISOString();
  const ownerId = project.owner_user_id ?? null;
  const [plan, ramp, siteUsage, sub, shareRows] = await Promise.all([
    projectPlan(projectId),
    siteSafeMax(projectId, now),
    weekUsageSince(projectId, since),
    ownerId ? getSubscription(ownerId) : Promise.resolve(null),
    ownerId ? readShareRows(ownerId) : Promise.resolve({ rows: [] as ShareRow[], error: null }),
  ]);
  const pool = plan.poolPerMonth;
  const rows = shareRows.rows;
  // Coverage as planGate decides it; without a live plan the free plan's
  // one site is the owner's oldest (billing.ts writerGate).
  const limit = isActive(sub) ? sitesLimitOf(sub!) : 1;
  const coveredRows = rows.slice(0, limit);
  const resolved = pool != null ? resolveShares(pool, coveredRows.filter((r) => !outsidePool(r))) : new Map<string, number>();
  const held = pool != null ? Math.max(0, pool - [...resolved.values()].reduce((a, b) => a + b, 0)) : 0;
  const [siteCounts, ownerMonth] = await Promise.all([
    Promise.all(rows.map((r) => usageFor([r.id], since))),
    pool != null && ownerId ? monthUsage(projectId, ownerId, now) : Promise.resolve(null),
  ]);
  const modeOf = (r: { share_mode?: string | null }): ShareMode => (r.share_mode === "custom" ? "custom" : "auto");
  return {
    pool,
    share: plan.articlesPerMonth,
    mode: modeOf(project),
    safeMax: Number.isFinite(ramp.safeMax) ? ramp.safeMax : null,
    reason: ramp.reason,
    usedThisMonth: siteUsage.count,
    ownerUsedThisMonth: ownerMonth && !("readError" in ownerMonth) ? ownerMonth.ownerCount : null,
    held,
    sites: rows.map((r, i) => {
      const covered = i < limit;
      return {
        slug: r.slug,
        domain: r.domain ?? "",
        share: pool == null || outsidePool(r) ? null : covered ? (resolved.get(r.id) ?? 0) : 0,
        mode: modeOf(r),
        covered,
        usedThisMonth: siteCounts[i].count,
      };
    }),
  };
}

/** What a site has used this month, measured before it is deleted. */
export type SiteMonthCarry = { ownerId: string; month: string; articleStarts: number; dfsMicrousd: number };

/**
 * Deleting a site, step 1 (before the row goes): measure what it already
 * used this month - its runs, drafts and DataForSEO rows stop being counted
 * once the project is gone. Step 2, addOwnerCarry, runs only after the
 * delete succeeded, so a failed delete never counts the month twice.
 * Together they close "delete a site and add it again to reset the month"
 * (migration 0090's owner_month_carry). Never throws: a failure is logged
 * and answers null, and the delete goes ahead.
 */
export async function measureSiteMonthCarry(
  project: Pick<Project, "id"> & { owner_user_id?: string | null; writer_weekly_quota?: number | null },
  now = new Date(),
): Promise<SiteMonthCarry | null> {
  try {
    if (!isCloudMode() || !project.owner_user_id) return null;
    const start = monthStartUtc(now);
    const [usage, dfs] = await Promise.all([
      // A site on the operator's override is not counted in the pool while
      // it lives, so it adds nothing to the pool when it goes.
      outsidePool(project) ? Promise.resolve({ count: 0, readError: undefined as string | undefined }) : usageFor([project.id], start.toISOString()),
      db().from("dataforseo_usage").select("cost_microusd").eq("project_id", project.id).gte("day", start.toISOString().slice(0, 10)),
    ]);
    if (usage.readError) console.warn(`[site-shares] carry: ${project.id}'s month could not be counted (${usage.readError}); its articles are not carried`);
    if (dfs.error) console.warn(`[site-shares] carry: ${project.id}'s DataForSEO month could not be read (${dfs.error.message}); its spend is not carried`);
    const articleStarts = usage.readError ? 0 : usage.count;
    const dfsMicrousd = dfs.error ? 0 : ((dfs.data ?? []) as Array<{ cost_microusd: number | null }>).reduce((a, r) => a + Number(r.cost_microusd ?? 0), 0);
    if (articleStarts <= 0 && dfsMicrousd <= 0) return null;
    return { ownerId: project.owner_user_id, month: start.toISOString().slice(0, 10), articleStarts, dfsMicrousd: Math.round(dfsMicrousd) };
  } catch (e) {
    console.error(`[site-shares] carry not measured for ${project.id}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Deleting a site, step 2: add the measured month to the owner's carry
 *  (atomic add, owner_month_carry_add). Never throws. */
export async function addOwnerCarry(carry: SiteMonthCarry | null): Promise<void> {
  if (!carry) return;
  try {
    const { error } = await db().rpc("owner_month_carry_add", {
      p_owner: carry.ownerId,
      p_month: carry.month,
      p_starts: carry.articleStarts,
      p_micro: carry.dfsMicrousd,
    });
    if (error) console.error(`[site-shares] carry not written for owner ${carry.ownerId}: ${error.message}`);
  } catch (e) {
    console.error(`[site-shares] carry not written for owner ${carry.ownerId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
