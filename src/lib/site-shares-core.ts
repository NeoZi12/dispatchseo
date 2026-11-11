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

export type StoredShare = { id: string; monthly_share: number | null | undefined; share_mode?: string | null };

/**
 * Each covered site's share as stored, made safe to act on. `sites` = the
 * owner's COVERED sites, oldest first. Walked in order: a stored share is
 * clamped to what is left of the pool (a downgrade shrinks the pool before
 * the next rebalance rewrites the shares); the sites with no share yet split
 * what remains after every stored share evenly, the remainder to the oldest.
 * Sum never exceeds the pool, nothing is negative, and one site with no
 * share gets the whole pool.
 */
export function resolveShares(pool: number, sites: StoredShare[]): Map<string, number> {
  const out = new Map<string, number>();
  let left = Math.max(0, Math.floor(pool));
  const unset: string[] = [];
  for (const s of sites) {
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

export type AutoShareSite = {
  id: string;
  share_mode: string | null | undefined;
  monthly_share: number | null | undefined;
  /** The most this site may take this month (safeMaxFor); Infinity = no cap. */
  safeMax: number;
  /** Research keeps coming back empty: no live ideas after a research run. */
  dry: boolean;
};

/** The most a "dry" site gets automatically: articles nobody can find
 *  keywords for are articles the pool should keep for the other sites. */
export const DRY_SITE_MAX = 2;

/**
 * The automatic split. `sites` oldest first (site_launched_at ?? created_at).
 *   1. Custom sites keep min(their share, what is left), in order.
 *   2. An auto site's cap is its safe maximum, and 2 when it is dry.
 *   3. Every auto site that may take one gets 1, oldest first, while the
 *      pool lasts.
 *   4. Then +1 round-robin, oldest first, to auto sites under their cap,
 *      until the pool is spent or every site is capped.
 *   5. Whatever is left is HELD: not given to anyone this month.
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
  const cap = new Map(auto.map((s) => [s.id, Math.max(0, Math.min(s.safeMax, s.dry ? DRY_SITE_MAX : Infinity))]));
  for (const s of auto) shares.set(s.id, 0);
  for (const s of auto) {
    if (left <= 0) break;
    if ((cap.get(s.id) ?? 0) >= 1) {
      shares.set(s.id, 1);
      left--;
    }
  }
  let gave = true;
  while (left > 0 && gave) {
    gave = false;
    for (const s of auto) {
      if (left <= 0) break;
      const have = shares.get(s.id) ?? 0;
      if (have < (cap.get(s.id) ?? 0)) {
        shares.set(s.id, have + 1);
        left--;
        gave = true;
      }
    }
  }
  return { shares, held: left };
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
