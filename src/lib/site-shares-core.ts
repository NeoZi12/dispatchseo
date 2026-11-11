// The arithmetic of multi-site plans, kept PURE (no database, no clock, no
// imports at all) so scripts/site-shares-test.mjs can load it straight from
// node and every rule below is tested with plain values. site-shares.ts and
// billing.ts fetch the rows and hand them here.
//
// The model (owner, 2026-11-11): a paid plan is one monthly POOL of articles
// per owner (Starter 5, Growth 15, Scale 30). Each covered site gets a fixed
// monthly SHARE of it, and then runs exactly as a single site always has:
// its own queue, research, ramp and spacing. The split is automatic by
// default; the owner may set a site's share by hand ("custom"), and the ramp
// still applies on top of a custom share.

export type ShareMode = "auto" | "custom";

/** A site's internal pace for a monthly share M: articles a week (what the
 *  ramp caps and cadence() counts) and the days between two starts.
 *  5 -> 2 a week, 6 days apart; 15 -> 4, 2 days; 30 -> 7, 1 day; 9 -> 3, 3
 *  days; 4 -> 1, 7 days; 2 -> 1, 15 days; 1 -> 1, 30 days. The exact monthly
 *  number is then held by the month gate (usage.ts monthAllowance), not by
 *  this pace: a calendar month is a bit more than four weeks. */
export function paceFor(month: number): { articlesPerWeek: number; spacingDays?: number } {
  const m = Number.isFinite(month) ? Math.floor(month) : 0;
  if (m <= 0) return { articlesPerWeek: 0 };
  return {
    articlesPerWeek: Math.min(7, Math.ceil(m / 4)),
    spacingDays: Math.max(1, Math.min(30, Math.floor(30 / m))),
  };
}

export type StoredShare = {
  id: string;
  monthly_share: number | null | undefined;
  share_mode?: string | null;
  /** The site cannot write right now (paused, or its setup isn't finished):
   *  it holds 0 whatever is stored, so its siblings can use the pool. The
   *  stored number is left alone - a Custom site gets it back the day it
   *  can write again. Absent = it can write. */
  idle?: boolean;
};

/**
 * Each covered site's share as stored, made safe to act on. `sites` = the
 * owner's COVERED sites, oldest first. Walked in order: a stored share is
 * clamped to what is left of the pool (a downgrade shrinks the pool before
 * the next rebalance rewrites the shares); the sites with no share yet split
 * what remains after every stored share evenly, the remainder to the oldest.
 * Sum never exceeds the pool, nothing is negative, and one site with no
 * share gets the whole pool. An idle site (paused, setup unfinished) holds 0
 * and is not one of "the sites with no share yet".
 */
export function resolveShares(pool: number, sites: StoredShare[]): Map<string, number> {
  const out = new Map<string, number>();
  let left = Math.max(0, Math.floor(pool));
  const unset: string[] = [];
  for (const s of sites) {
    if (s.idle) {
      out.set(s.id, 0);
      continue;
    }
    const stored = s.monthly_share;
    if (stored == null || !Number.isFinite(stored)) {
      unset.push(s.id);
      continue;
    }
    const v = Math.min(Math.max(0, Math.floor(stored)), left);
    out.set(s.id, v);
    left -= v;
  }
  if (unset.length) {
    const base = Math.floor(left / unset.length);
    let extra = left - base * unset.length;
    for (const id of unset) {
      out.set(id, base + (extra > 0 ? 1 : 0));
      if (extra > 0) extra--;
    }
  }
  return out;
}

/**
 * The shares projectPlan acts on: resolveShares, except that an owner with
 * exactly ONE site in the pool always gives that site the whole pool,
 * whatever its stored number says. A single site has no sibling to hand
 * articles to, so a stored number below the pool could only take articles
 * from a paying customer; the ramp already paces a young site week by week.
 */
export function sharesForPool(pool: number, sites: StoredShare[]): Map<string, number> {
  if (sites.length === 1) return new Map([[sites[0].id, Math.max(0, Math.floor(pool))]]);
  return resolveShares(pool, sites);
}

/**
 * The pace a pooled site runs at TODAY, from what its month still owes it.
 * paceFor spaces a share evenly over a 30-day month with no slack: 15 a
 * month is one every 2 days from the 1st, so one skipped day (no idea ready,
 * a research day, a short February) lost that article for good, and the
 * owner got 14 of the 15 they pay for. Here the days between starts shrink,
 * never below one day and never above the plan's own spacing, when the
 * articles left need it: floor(days left in the month / articles left).
 * While catching up, the week's count may go up to one a day, so the weekly
 * number cannot hold back an article the month still owes. The month gate
 * holds the exact number either way.
 *
 * One start a day is the engine's ceiling (the scheduler runs once a day),
 * so 30 a month on ONE site still needs a start on every day of a 30-day
 * month; this cannot add a second start to a day.
 *
 * `dayOfMonth` 1-based and `daysInMonth`, both UTC. `quota` 0 (no plan, the
 * index brake) and a used-up share pass through untouched.
 */
export function catchUpPace(i: { share: number; used: number; dayOfMonth: number; daysInMonth: number; spacingDays: number; quota: number }): { spacingDays: number; quota: number } {
  const same = { spacingDays: i.spacingDays, quota: i.quota };
  const left = Math.floor(i.share) - Math.max(0, Math.floor(i.used));
  if (!(i.quota > 0) || !(left > 0) || !(i.spacingDays > 1)) return same;
  const daysLeft = Math.max(1, Math.floor(i.daysInMonth) - Math.floor(i.dayOfMonth) + 1);
  const needed = Math.max(1, Math.floor(daysLeft / left));
  if (needed >= i.spacingDays) return same;
  return { spacingDays: needed, quota: Math.max(i.quota, 7) };
}

export type AutoShareSite = {
  id: string;
  share_mode: string | null | undefined;
  monthly_share: number | null | undefined;
  /** The most this site may take this month (safeMaxFor); Infinity = no cap. */
  safeMax: number;
  /** Research keeps coming back empty: no live ideas, and the last two
   *  research runs each kept at most one. */
  dry: boolean;
  /** Articles already counted for this site this month (the month gate's
   *  own count). Its share never drops below what it has used, as far as
   *  the pool allows: a share cut under the used count would only strand
   *  the site until the 1st. Absent = 0. */
  used?: number;
  /** Can this site write this month at all (not paused, setup finished,
   *  not stopped by the index brake)? Only such sites take the leftovers.
   *  Absent = safeMax > 0, which is how the rebalance encodes all three. */
  canWrite?: boolean;
};

/** The most a "dry" site gets automatically: articles nobody can find
 *  keywords for are articles the pool should keep for the other sites. */
export const DRY_SITE_MAX = 2;

/**
 * The automatic split. `sites` oldest first (site_launched_at ?? created_at).
 *   1. Custom sites keep min(their share, what is left), in order.
 *   2. Every auto site starts at what it has already used this month, as
 *      far as the pool allows (oldest first).
 *   3. An auto site's cap is its safe maximum, and 2 when it is dry.
 *   4. Every auto site still at 0 that may take one gets 1, oldest first,
 *      while the pool lasts.
 *   5. Then +1 round-robin, oldest first, to auto sites under their cap,
 *      until the pool is spent or every site is capped.
 *   6. The whole pool is always handed out (owner, 2026-11-11: "If I'm on
 *      a 30-article-a-month plan, give me 30 articles"). Whatever is still
 *      left goes round-robin, oldest first, to every auto site that can
 *      write, past its safe maximum: non-dry sites first, then dry sites if
 *      any remain. Steps 3-5 are what give older, better-indexed sites more;
 *      this step is what makes the pool deliverable. (A paid site's run-time
 *      pace no longer follows the ramp - autopilot/ramp.ts rampVerdict.)
 *   7. Whatever is left is HELD: only when no auto site can write at all
 *      (every one paused, unfinished or stopped by the index brake), or
 *      custom shares leave articles and there is no auto site to take them.
 * A custom site with no number stored counts as auto.
 */
export function autoShares(input: { pool: number; sites: AutoShareSite[] }): { shares: Map<string, number>; held: number } {
  const shares = new Map<string, number>();
  let left = Math.max(0, Math.floor(input.pool));
  const isCustom = (s: AutoShareSite) => s.share_mode === "custom" && s.monthly_share != null && Number.isFinite(s.monthly_share);
  for (const s of input.sites) {
    if (!isCustom(s)) continue;
    const v = Math.min(Math.max(0, Math.floor(s.monthly_share as number)), left);
    shares.set(s.id, v);
    left -= v;
  }
  const auto = input.sites.filter((s) => !isCustom(s));
  const safe = (s: AutoShareSite) => Math.max(0, s.safeMax);
  const cap = new Map(auto.map((s) => [s.id, Math.min(safe(s), s.dry ? DRY_SITE_MAX : Infinity)]));
  for (const s of auto) {
    const floor = Math.min(Math.max(0, Math.floor(s.used ?? 0)), left);
    shares.set(s.id, floor);
    left -= floor;
  }
  for (const s of auto) {
    if (left <= 0) break;
    if ((shares.get(s.id) ?? 0) === 0 && (cap.get(s.id) ?? 0) >= 1) {
      shares.set(s.id, 1);
      left--;
    }
  }
  const roundRobin = (sites: AutoShareSite[], limit: (s: AutoShareSite) => number) => {
    let gave = true;
    while (left > 0 && gave) {
      gave = false;
      for (const s of sites) {
        if (left <= 0) break;
        const have = shares.get(s.id) ?? 0;
        if (have < limit(s)) {
          shares.set(s.id, have + 1);
          left--;
          gave = true;
        }
      }
    }
  };
  roundRobin(auto, (s) => cap.get(s.id) ?? 0);
  const writes = auto.filter((s) => s.canWrite ?? safe(s) > 0);
  roundRobin(writes.filter((s) => !s.dry), () => Infinity);
  roundRobin(writes.filter((s) => s.dry), () => Infinity);
  return { shares, held: left };
}

/** A covered site that cannot write this month - paused, or setup not
 *  finished - may take nothing from the pool: its articles go to the
 *  siblings. (One site alone still gets the whole pool: sharesForPool.) */
export function safeMaxForSite(site: { paused: boolean; setupDone: boolean; canPublish?: boolean }, rampSafeMax: number): number {
  // canPublish false: the site has nowhere to send an article (its repo or
  // WordPress was disconnected), and the scheduler skips it every day - a
  // share held there is articles the owner pays for and nobody writes.
  return site.paused || !site.setupDone || site.canPublish === false ? 0 : rampSafeMax;
}

/** The ramp's weekly ceiling as a monthly cap: one a week -> 4 a month, two
 *  -> 9, full speed -> no cap, paused -> 0. `quota` is rampVerdict's answer
 *  for a plan quota of RAMP_PROBE_QUOTA, so "full" reads as that number. */
export const RAMP_PROBE_QUOTA = 99;
export function safeMaxFor(ramp: { quota: number; stage: string }): number {
  if (ramp.stage === "pause" || ramp.quota <= 0) return 0;
  if (ramp.quota >= RAMP_PROBE_QUOTA) return Infinity;
  if (ramp.quota === 1) return 4;
  if (ramp.quota === 2) return 9;
  return ramp.quota * 4;
}

export type MonthGateReason = "share used" | "plan used";

/**
 * The month gate's comparison: has this site used its share, or the owner
 * used the plan's pool across their sites? null = an article may start (the
 * week's rules - ramp, quota, spacing - still apply after this). A share of
 * 0 is left to cadence(), which already says "no quota" for it.
 */
export function monthGateVerdict(i: { share: number; pool: number; siteCount: number; ownerCount: number }): MonthGateReason | null {
  if (i.share > 0 && i.siteCount >= i.share) return "share used";
  if (i.ownerCount >= i.pool) return "plan used";
  return null;
}

/** The custom share an owner may set for one site: 1 up to the pool minus
 *  what their other covered sites have set by hand. */
export function customShareLimit(pool: number, otherCustomSum: number): number {
  return Math.max(0, Math.floor(pool) - Math.max(0, Math.floor(otherCustomSum)));
}
