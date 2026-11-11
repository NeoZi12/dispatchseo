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
  type Subscription,
  type Tier,
} from "./billing";
import { getProjectById, type Project } from "./projects";
import { earlyResearchAllowed, monthStartUtc } from "./autopilot/math";
import { rampInputs, rampSinceDay, rampVerdict, rampWeighting, type RampPlan } from "./autopilot/ramp";
import { monthUsage, usageFor, weekUsageSince } from "./autopilot/usage";
import { readResearchState } from "./keyword-research-cache";
import { autoShares, customShareLimit, RAMP_PROBE_QUOTA, safeMaxFor, safeMaxForSite, sharesForPool, type AutoShareSite, type ShareMode } from "./site-shares-core";

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
  writer_mode: string | null;
  writer_paused_at: string | null;
  setup_connected_at: string | null;
  next_article_at: string | null;
  created_at: string | null;
  site_launched_at: string | null;
  last_research_at: string | null;
};

async function readShareRows(ownerId: string): Promise<{ rows: ShareRow[]; error: string | null }> {
  const { data, error } = await db()
    .from("projects")
    .select("id, slug, domain, monthly_share, share_mode, writer_weekly_quota, writer_mode, writer_paused_at, setup_connected_at, next_article_at, created_at, site_launched_at, last_research_at")
    .eq("owner_user_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as ShareRow[], error: null };
}

/** The owner's live plan and its pool, or null when there is no pool to
 *  split: self-host, billing unconfigured, or no live subscription. */
async function ownerPool(ownerId: string, freshSub?: Subscription | null): Promise<{ tier: Tier; pool: number; sitesLimit: number } | null> {
  if (!isCloudMode() || !polarConfigured()) return null;
  // freshSub: a plan row the caller has JUST written (billing.ts
  // applySubscriptionState); getSubscription's per-request memo may still
  // hold the row as it was before that write.
  const sub = freshSub !== undefined ? freshSub : await getSubscription(ownerId);
  if (!isActive(sub)) return null;
  const tier: Tier = sub!.status === "trialing" ? "starter" : sub!.tier;
  return { tier, pool: articlesPerMonthFor(tier), sitesLimit: sitesLimitOf(sub!) };
}

/** The most a site can take this month as the RUNTIME sees it, with the
 *  reason. Through rampVerdict, so a paid pooled site reads "no cap" (null)
 *  unless the index brake paused it (0, with its reason); free, self-host
 *  and unbilled keep the ramp's monthly cap. A read failure off a paid pool
 *  is rampVerdict's slowest safe answer (one a week -> 4). */
async function siteSafeMax(projectId: string, plan: Pick<RampPlan, "poolPerMonth">, now: Date): Promise<{ safeMax: number; reason: string | null }> {
  const verdict = rampVerdict(await rampInputs(projectId, rampSinceDay(now)), { articlesPerWeek: RAMP_PROBE_QUOTA, poolPerMonth: plan.poolPerMonth }, now);
  return { safeMax: safeMaxFor(verdict), reason: verdict.reason };
}

/** Research keeps coming back empty for this site: no live ideas
 *  (approved, or waiting in the backlog) AND its research history says
 *  research is not finding things (the last two runs each kept at most one
 *  idea, math.ts earlyResearchAllowed). An empty queue between two healthy
 *  research runs is not dry, and neither is a site never researched. */
async function isDry(row: ShareRow): Promise<boolean> {
  if (!row.last_research_at) return false;
  const [{ count, error }, state] = await Promise.all([
    db().from("suggestions").select("id", { count: "exact", head: true }).eq("project_id", row.id).eq("type", "guide").in("status", ["approved", "pending"]),
    readResearchState(row.id),
  ]);
  if (error) throw new Error(`could not count ${row.slug}'s ideas: ${error.message}`);
  return (count ?? 0) === 0 && !earlyResearchAllowed(state);
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
  freshSub?: Subscription | null,
): Promise<{ shares: Record<string, number>; held: number } | null> {
  try {
    const plan = await ownerPool(ownerId, freshSub);
    if (!plan) return null;
    const { rows, error } = await readShareRows(ownerId);
    if (error) throw new Error(error);
    const covered = rows.slice(0, plan.sitesLimit).filter((r) => !outsidePool(r));
    if (!covered.length) return { shares: {}, held: plan.pool };
    // Pinned = a site whose stored number this pass must keep: a Custom
    // site (cadence() still paces it), or an automatic one whose ramp could
    // not be read - a read failure is no evidence to cut a share on.
    const pinned = new Set<string>();
    let result: { shares: Map<string, number>; held: number };
    if (covered.length === 1) {
      // One site alone always has the whole pool (sharesForPool); the ramp
      // does the limiting week by week.
      result = { shares: new Map([[covered[0].id, plan.pool]]), held: 0 };
      if (isCustomRow(covered[0])) pinned.add(covered[0].id);
    } else {
      const since = monthStartUtc(now).toISOString();
      const inputs = await Promise.all(
        covered.map(async (r): Promise<AutoShareSite & { order: number }> => {
          const order = Date.parse(r.site_launched_at ?? r.created_at ?? "") || 0;
          if (isCustomRow(r)) {
            pinned.add(r.id);
            return { id: r.id, share_mode: "custom", monthly_share: r.monthly_share, safeMax: Infinity, dry: false, order };
          }
          // The month gate's own per-site count (the site's quota bucket), so
          // a share is never cut below what the site already used.
          const [inputsRead, dry, used] = await Promise.all([rampInputs(r.id, rampSinceDay(now)), isDry(r), weekUsageSince(r.id, since)]);
          if (used.readError) throw new Error(`could not count ${r.slug}'s month: ${used.readError}`);
          if (!inputsRead) {
            // Keep the stored number. With none stored, the slowest safe cap
            // stands in for the siblings' arithmetic only; nothing is written.
            pinned.add(r.id);
            return r.monthly_share != null
              ? { id: r.id, share_mode: "custom", monthly_share: r.monthly_share, safeMax: Infinity, dry: false, order }
              : { id: r.id, share_mode: "auto", monthly_share: null, safeMax: 4, dry, used: used.count, order };
          }
          // The ramp WEIGHTS the split (older, better-indexed sites first);
          // it no longer limits a paid site at run time (ramp.ts), and
          // autoShares hands every leftover to the sites that can write.
          // A paused site, one whose setup isn't finished, or one the index
          // brake stopped (safeMax 0) cannot write: its articles go to the
          // siblings this month.
          const ramp = safeMaxFor(rampWeighting(inputsRead, RAMP_PROBE_QUOTA, now));
          const safeMax = safeMaxForSite({ paused: Boolean(r.writer_paused_at), setupDone: Boolean(r.setup_connected_at) }, ramp);
          return { id: r.id, share_mode: r.share_mode, monthly_share: r.monthly_share, safeMax, dry, used: used.count, order };
        }),
      );
      // Oldest first by when the SITE launched, else when it joined: the site
      // with the longest history is the one Google trusts with more.
      inputs.sort((a, b) => a.order - b.order);
      result = autoShares({ pool: plan.pool, sites: inputs });
    }
    const writes = covered.filter((r) => !pinned.has(r.id) && result.shares.get(r.id) !== r.monthly_share);
    const failed: string[] = [];
    const nowIso = now.toISOString();
    await Promise.all(
      writes.map(async (r) => {
        const next = result.shares.get(r.id) ?? 0;
        // Only while the site is still automatic: an owner's Custom set in
        // the same instant wins.
        const { error: wErr } = await db()
          .from("projects")
          .update({ monthly_share: next })
          .eq("id", r.id)
          .eq("share_mode", r.share_mode ?? "auto");
        if (wErr) {
          failed.push(`${r.slug}: ${wErr.message}`);
          return;
        }
        // A RAISED share must be usable today: a date stamped in the future
        // (a month or week the old share had used up) would hold the claim
        // until then. Same conditional clear setSiteShare uses; every start
        // still passes the month, ramp, week and spacing rules.
        const raised = r.monthly_share == null || next > r.monthly_share;
        if (raised && r.next_article_at && r.next_article_at > nowIso) {
          const { error: cErr } = await db().from("projects").update({ next_article_at: null }).eq("id", r.id).gt("next_article_at", nowIso);
          if (cErr) failed.push(`${r.slug} (next_article_at): ${cErr.message}`);
        }
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
  if (outsidePool(row)) {
    return {
      error:
        row.writer_mode === "hosted"
          ? "This site's pace is set by DispatchSEO by hand, so it sits outside your plan's split."
          : "This site's articles are written by your own agent, not by DispatchSEO, so it sits outside your plan's split.",
    };
  }
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
  /** The most this site can take this month; null = no cap. On a paid
   *  pooled plan always null, except 0 when the index brake stopped the
   *  site. Free and self-host keep the ramp's monthly cap. */
  safeMax: number | null;
  /** Why it is capped, as a sentence; null when it isn't. On a paid pooled
   *  plan only the index brake's reason. */
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
  const plan = await projectPlan(projectId);
  const [ramp, siteUsage, sub, shareRows] = await Promise.all([
    siteSafeMax(projectId, plan, now),
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
  const resolved = pool != null ? sharesForPool(pool, coveredRows.filter((r) => !outsidePool(r))) : new Map<string, number>();
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
  project: Pick<Project, "id" | "writer_mode"> & { owner_user_id?: string | null; writer_weekly_quota?: number | null },
  now = new Date(),
): Promise<SiteMonthCarry | null> {
  try {
    if (!isCloudMode() || !project.owner_user_id) return null;
    const start = monthStartUtc(now);
    const [usage, dfs] = await Promise.all([
      // A site outside the pool (the operator's override, or not written by
      // the hosted writer) is not counted in it while it lives, so it adds
      // nothing to the pool when it goes.
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
