import { jaccard, tokens } from "../writer/evidence";

// The autopilot's arithmetic, kept PURE (no database, no model, no clock of
// its own) so every rule that decides "write today?", "pause this site?" or
// "is this keyword worth an article?" can be unit-tested with plain values.
// The modules around it (scheduler, pause, research, report) only fetch rows
// and hand them here.

export const DAY_MS = 86_400_000;

// --- Cadence --------------------------------------------------------------------

/** Two articles of one site never start less than this many UTC calendar
 *  days apart: a weekly quota of 3 lands as Mon / Wed / Fri, never three on
 *  one morning, because a burst is what a content farm looks like from the
 *  outside. Calendar days, not 48 hours: a run that started at 05:31 must
 *  not push the next one past the 05:30 cron two days later. A quota of 4
 *  or more cannot fit in a week two days apart, so those plans go daily
 *  (Scale: five) - still one a day, never two. */
export const MIN_SPACING_DAYS = 2;
export function spacingDaysFor(quota: number): number {
  return quota >= 4 ? 1 : MIN_SPACING_DAYS;
}

/** Midnight UTC of the day containing `d`. */
export function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole UTC calendar days from `a` to `b` (b later = positive). */
export function utcDaysBetween(a: Date, b: Date): number {
  return Math.round((utcDay(b).getTime() - utcDay(a).getTime()) / DAY_MS);
}

/** Monday 00:00 UTC of the ISO week containing `now`. The quota resets here. */
export function weekStartUtc(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY_MS);
}

export type CadenceInput = {
  now: Date;
  /** Articles a week for this site's plan. 0 = the plan buys none. */
  quota: number;
  /** Days between two starts when the plan sets its own (the free tier:
   *  billing.ts freeSpacingDays); otherwise spacingDaysFor(quota). */
  spacingDays?: number;
  /** Hosted articles started this ISO week that are live or on their way
   *  (anything not rejected/discarded, plus runs still writing). */
  countThisWeek: number;
  /** When the most recent hosted article (or run) was started; null = never. */
  lastStartedAt: string | null;
};

export type CadenceVerdict =
  | { write: true; nextAfter: Date }
  | { write: false; reason: "quota met" | "spacing" | "no quota"; nextAt: Date | null };

/**
 * May the scheduler start an article now, and if not, when next. `nextAfter`
 * on a yes is the earliest the FOLLOWING article may start - what the
 * dashboard shows as "next article" once this one is under way.
 */
export function cadence(input: CadenceInput): CadenceVerdict {
  const { now, quota, countThisWeek, lastStartedAt } = input;
  const nextWeek = new Date(weekStartUtc(now).getTime() + 7 * DAY_MS);
  if (quota <= 0) return { write: false, reason: "no quota", nextAt: null };
  // The first UTC midnight at which the spacing rule allows a start.
  const spacing = input.spacingDays ?? spacingDaysFor(quota);
  const spacedFrom = (iso: string | null) => (iso ? new Date(utcDay(new Date(iso)).getTime() + spacing * DAY_MS) : null);
  const earliest = spacedFrom(lastStartedAt);
  if (countThisWeek >= quota) {
    const at = earliest && earliest > nextWeek ? earliest : nextWeek;
    return { write: false, reason: "quota met", nextAt: at };
  }
  if (earliest && earliest > now) {
    // Spacing would push the next start into next week: then the quota
    // resets there, which is the same date either way.
    return { write: false, reason: "spacing", nextAt: earliest };
  }
  const following = new Date(utcDay(now).getTime() + spacing * DAY_MS);
  // Starting this one fills the quota: the next one waits for Monday.
  const nextAfter = countThisWeek + 1 >= quota && nextWeek > following ? nextWeek : following;
  return { write: true, nextAfter };
}

/**
 * The dates the next `n` articles of a site are expected to start, from the
 * same rules cadence() applies: the weekly quota (Monday reset), the spacing
 * between two starts, and the daily 05:30 UTC run. Pure projection for the
 * queue screen ("this idea is next, on Wednesday"); the scheduler itself
 * still decides each morning. Dates are UTC midnights.
 */
export function upcomingStarts(input: CadenceInput & { n: number }): Date[] {
  const { quota, n } = input;
  if (quota <= 0 || n <= 0) return [];
  const spacing = input.spacingDays ?? spacingDaysFor(quota);
  const out: Date[] = [];
  // The daily run is at 05:30 UTC: once it has passed, today is no longer a
  // candidate (nothing starts twice in a day).
  const past = input.now.getUTCHours() > 5 || (input.now.getUTCHours() === 5 && input.now.getUTCMinutes() >= 40);
  let day = new Date(utcDay(input.now).getTime() + (past ? DAY_MS : 0));
  // The week of NOW, not of the first candidate day: countThisWeek counts
  // this week's starts, so a projection that begins on next Monday (Sunday
  // after the run) must reset it at once.
  let week = weekStartUtc(input.now);
  let count = input.countThisWeek;
  let last = input.lastStartedAt ? utcDay(new Date(input.lastStartedAt)) : null;
  for (let guard = 0; out.length < n && guard < 400; guard++, day = new Date(day.getTime() + DAY_MS)) {
    const thisWeek = weekStartUtc(day);
    if (thisWeek.getTime() !== week.getTime()) {
      week = thisWeek;
      count = 0;
    }
    if (count >= quota) continue;
    if (last && utcDaysBetween(last, day) < spacing) continue;
    out.push(day);
    last = day;
    count++;
  }
  return out;
}

// --- Auto-pause ---------------------------------------------------------------

/** Decision 4 of the 2026-10-23 spec, as numbers. */
export const COLLAPSE_RATIO = 0.4;
export const COLLAPSE_MIN_PRIOR_IMPRESSIONS = 500;
export const ZERO_IMPRESSION_STREAK = 3;
export const ZERO_IMPRESSION_INDEXED_DAYS = 21;
/** gsc.ts stores the top 100 pages per day. A day whose list is full may have
 *  dropped a page with a handful of impressions; such a day cannot prove 0. */
export const GSC_TOP_PAGES_LIMIT = 100;

export type GscDay = {
  date: string; // yyyy-mm-dd
  impressions: number;
  top_pages?: Array<{ page: string; impressions: number }> | null;
};

export type CollapseVerdict =
  | { collapsed: true; last7: number; expected7: number; prior28: number; reason: string }
  | { collapsed: false; last7?: number; expected7?: number; prior28?: number; why: string };

/**
 * Has Search Console visibility collapsed? Last 7 days of impressions under
 * 40% of what the prior 28 days predict (their daily average x 7), on a site
 * big enough for the ratio to mean something (prior 28 days >= 500).
 *
 * The window is anchored on the newest date WITH data, not on today: GSC lags
 * two to three days, and anchoring on today would read that lag as a
 * collapse. And it refuses to judge on gaps - a missing day inside the last
 * seven is a sync hiccup, not zero traffic, and reading it as zero would
 * pause a healthy site because our own cron missed a night.
 */
/** GSC's newest days are partial for about three days; a day that recent is
 *  a fraction of its final count and would read as a collapse. */
export const GSC_SETTLE_DAYS = 3;

export function gscCollapse(rows: GscDay[], now: Date): CollapseVerdict {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, Number(r.impressions) || 0);
  // Anchor on the newest stored date that is at least 3 UTC days old.
  const settledBy = new Date(utcDay(now).getTime() - GSC_SETTLE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const dates = [...byDate.keys()].filter((d) => d <= settledBy).sort();
  const latest = dates.at(-1);
  if (!latest) return { collapsed: false, why: byDate.size ? "no settled Search Console days yet" : "no Search Console data" };
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  if (now.getTime() - latestMs > (7 + GSC_SETTLE_DAYS) * DAY_MS) return { collapsed: false, why: "Search Console data is over a week old" };
  const day = (offset: number) => new Date(latestMs - offset * DAY_MS).toISOString().slice(0, 10);

  let last7 = 0;
  for (let i = 0; i < 7; i++) {
    const v = byDate.get(day(i));
    if (v === undefined) return { collapsed: false, why: "a day is missing in the last 7 - not judging on gaps" };
    last7 += v;
  }
  let prior28 = 0;
  let priorDays = 0;
  for (let i = 7; i < 35; i++) {
    const v = byDate.get(day(i));
    if (v === undefined) continue;
    prior28 += v;
    priorDays++;
  }
  if (priorDays < 14) return { collapsed: false, last7, why: "fewer than 14 days of history before the last week" };
  // Scale a partially-covered window to 28 days so a missing day there does
  // not lower the bar; the 500 floor applies to the scaled total.
  const scaled28 = (prior28 / priorDays) * 28;
  const expected7 = (scaled28 / 28) * 7;
  if (scaled28 < COLLAPSE_MIN_PRIOR_IMPRESSIONS) {
    return { collapsed: false, last7, expected7, prior28: Math.round(scaled28), why: "too little traffic for the ratio to mean anything" };
  }
  if (last7 < COLLAPSE_RATIO * expected7) {
    const pct = Math.round((1 - last7 / expected7) * 100);
    return {
      collapsed: true,
      last7,
      expected7: Math.round(expected7),
      prior28: Math.round(scaled28),
      reason: `Search Console impressions fell ${pct}% (last 7 days ${last7.toLocaleString("en-US")} against ~${Math.round(expected7).toLocaleString("en-US")} expected from the 28 days before)`,
    };
  }
  return { collapsed: false, last7, expected7: Math.round(expected7), prior28: Math.round(scaled28), why: "impressions within range" };
}

export type HostedArticleStat = {
  url: string;
  publishedAt: string;
  indexedAt: string | null;
};

// --- Ramp and index-rate brake ---------------------------------------------------
//
// A new site never starts at its plan's full pace, and a site Google is not
// indexing slows down instead of piling up pages nobody will see (2026-11-08
// spam-safety research: dispatchseo.com was demoted publishing ~1 a day on a
// 22%-indexed site; ClockedCode grew at ~76% indexed). Applied as a ceiling
// on the plan's weekly quota by every caller of cadence() - the scheduler,
// manual starts, the queue projection - so neither a quota override nor a
// manual start can skip it.
//   weeks 1-4 of a site's engine life   1 a week
//   weeks 5-8                           2 a week
//   after that                          the plan's number, once >= 60% of its
//                                       engine articles (14+ days old) are
//                                       indexed; 2 a week until then
//   no Search Console data              1 a week (nothing to judge by)
//   brake: of the articles 28+ days old (6 or more), under 40% indexed - 1 a
//   week; the same at 56+ days old - pause, with the reason.

export const RAMP_WEEKS_SLOW = 4;
export const RAMP_WEEKS_MEDIUM = 8;
export const RAMP_FULL_INDEX_RATE = 0.6;
export const BRAKE_INDEX_RATE = 0.4;
export const BRAKE_MIN_ARTICLES = 6;

export type RampInput = {
  planQuota: number;
  now: Date;
  /** When the engine started this site's first article (null = none yet). */
  firstStartAt: string | null;
  /** Search Console data arrives for the site (rows in the last two weeks). */
  gscConnected: boolean;
  /** The site's published engine articles with their indexed date. */
  articles: Array<{ publishedAt: string; indexedAt: string | null }>;
};
export type RampVerdict = { quota: number; stage: "ramp-1" | "ramp-2" | "full" | "awaiting-index" | "no-gsc" | "brake" | "pause"; reason: string | null };

function indexRate(articles: RampInput["articles"], now: Date, minAgeDays: number): { n: number; rate: number } {
  const old = articles.filter((a) => now.getTime() - Date.parse(a.publishedAt) >= minAgeDays * DAY_MS);
  const indexed = old.filter((a) => a.indexedAt).length;
  return { n: old.length, rate: old.length ? indexed / old.length : 0 };
}

export function rampQuota(i: RampInput): RampVerdict {
  const plan = Math.max(0, i.planQuota);
  if (plan === 0) return { quota: 0, stage: "full", reason: null };
  const cap = (q: number) => Math.min(plan, q);
  // No Search Console, no index data: indexedAt comes from the URL
  // Inspection API alone, so without a connection every article reads as
  // "not indexed" and the brake below would pause a healthy site at week 8
  // (found 2026-11-08). Such a site stays at one a week instead.
  if (!i.gscConnected) return { quota: cap(1), stage: "no-gsc", reason: "one a week until Search Console data arrives" };
  // The brake reads first: a site Google is not indexing slows down (and
  // stops) whatever its age.
  const at56 = indexRate(i.articles, i.now, 56);
  if (at56.n >= BRAKE_MIN_ARTICLES && at56.rate < BRAKE_INDEX_RATE) {
    return { quota: 0, stage: "pause", reason: `only ${Math.round(at56.rate * 100)}% of its ${at56.n} articles older than 8 weeks are in Google's index` };
  }
  const at28 = indexRate(i.articles, i.now, 28);
  if (at28.n >= BRAKE_MIN_ARTICLES && at28.rate < BRAKE_INDEX_RATE) {
    return { quota: cap(1), stage: "brake", reason: `only ${Math.round(at28.rate * 100)}% of its ${at28.n} articles older than 4 weeks are indexed - one a week until Google catches up` };
  }
  const weeks = i.firstStartAt ? Math.floor((i.now.getTime() - Date.parse(i.firstStartAt)) / (7 * DAY_MS)) : 0;
  if (weeks < RAMP_WEEKS_SLOW) return { quota: cap(1), stage: "ramp-1", reason: "a new site starts at one a week" };
  if (weeks < RAMP_WEEKS_MEDIUM) return { quota: cap(2), stage: "ramp-2", reason: "two a week in its second month" };
  const at14 = indexRate(i.articles, i.now, 14);
  if (at14.n < 3 || at14.rate < RAMP_FULL_INDEX_RATE) {
    return { quota: cap(2), stage: "awaiting-index", reason: `two a week until 60% of its articles are indexed (${Math.round(at14.rate * 100)}% now)` };
  }
  return { quota: plan, stage: "full", reason: null };
}

/**
 * The collapse rule for a SMALL site, which gscCollapse's 500-impression floor
 * never sees: the last 14 settled days down 60% or more against the 14 before,
 * on a base of at least 50. Same anchoring and gap tolerance as gscCollapse.
 */
export const SMALL_COLLAPSE_MIN_BASE = 50;
export const SMALL_COLLAPSE_RATIO = 0.4;
export function smallSiteCollapse(rows: GscDay[], now: Date): CollapseVerdict {
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, Number(r.impressions) || 0);
  const settledBy = new Date(utcDay(now).getTime() - GSC_SETTLE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const latest = [...byDate.keys()].filter((d) => d <= settledBy).sort().at(-1);
  if (!latest) return { collapsed: false, why: "no settled Search Console days yet" };
  const latestMs = Date.parse(`${latest}T00:00:00Z`);
  if (now.getTime() - latestMs > (7 + GSC_SETTLE_DAYS) * DAY_MS) return { collapsed: false, why: "Search Console data is over a week old" };
  const day = (offset: number) => new Date(latestMs - offset * DAY_MS).toISOString().slice(0, 10);
  let last = 0;
  let prior = 0;
  let missingLast = 0;
  let priorDays = 0;
  for (let k = 0; k < 14; k++) {
    const v = byDate.get(day(k));
    if (v === undefined) missingLast++;
    else last += v;
  }
  if (missingLast > 1) return { collapsed: false, why: "days are missing in the last 14 - not judging on gaps" };
  for (let k = 14; k < 28; k++) {
    const v = byDate.get(day(k));
    if (v === undefined) continue;
    prior += v;
    priorDays++;
  }
  if (priorDays < 10) return { collapsed: false, why: "fewer than 10 days of history before the last two weeks" };
  const base = (prior / priorDays) * 14;
  if (base < SMALL_COLLAPSE_MIN_BASE) return { collapsed: false, why: "too little traffic for the ratio to mean anything" };
  if (last <= SMALL_COLLAPSE_RATIO * base) {
    const pct = Math.round((1 - last / base) * 100);
    return { collapsed: true, last7: last, expected7: Math.round(base), prior28: Math.round(base * 2), reason: `Search Console impressions fell ${pct}% (last 14 days ${last.toLocaleString("en-US")} against ~${Math.round(base).toLocaleString("en-US")} the 14 days before)` };
  }
  return { collapsed: false, why: "impressions within range" };
}

/**
 * Three hosted articles in a row, each indexed for 21+ days, none with a
 * single impression: the writer is producing pages Google indexes and then
 * shows to nobody. Writing a fourth is spending money on the same result.
 *
 * "Zero" has to be PROVEN from the stored top-100 page lists: a page absent
 * from a day's list only had no impressions that day if the list was not full.
 * Any full day since the page was indexed makes that page unknown, and an
 * unknown page breaks the streak - a wrong pause stops a paying customer's
 * site, a missed one costs one more article.
 */
/** One page, however it was written down: GSC reports the www or apex
 *  origin the site serves from, our records may carry the other one. */
export function normalizeArticleUrl(u: string): string {
  return u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
}

export function zeroImpressionStreak(
  articles: HostedArticleStat[],
  gsc: GscDay[],
  now: Date,
  /** Only articles published after this count (the owner's last resume). */
  since: string | null = null,
): { triggered: true; urls: string[]; reason: string } | { triggered: false; why: string } {
  const eligible = articles
    .filter((a) => !since || Date.parse(a.publishedAt) > Date.parse(since))
    .filter((a) => a.indexedAt && now.getTime() - Date.parse(a.indexedAt) >= ZERO_IMPRESSION_INDEXED_DAYS * DAY_MS)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, ZERO_IMPRESSION_STREAK);
  if (eligible.length < ZERO_IMPRESSION_STREAK) return { triggered: false, why: `fewer than ${ZERO_IMPRESSION_STREAK} articles indexed for ${ZERO_IMPRESSION_INDEXED_DAYS}+ days` };
  const norm = normalizeArticleUrl;
  for (const a of eligible) {
    const since = a.indexedAt!.slice(0, 10);
    const days = gsc.filter((d) => d.date >= since);
    // At least two weeks of observed days, or there is nothing to prove with.
    if (days.length < 14) return { triggered: false, why: "not enough Search Console days since indexing" };
    let impressions = 0;
    for (const d of days) {
      const pages = d.top_pages ?? null;
      if (!pages || pages.length >= GSC_TOP_PAGES_LIMIT) return { triggered: false, why: "page lists were full on some days, so zero cannot be proven" };
      for (const p of pages) if (norm(p.page) === norm(a.url)) impressions += Number(p.impressions) || 0;
    }
    if (impressions > 0) return { triggered: false, why: "a recent article has impressions" };
  }
  return {
    triggered: true,
    urls: eligible.map((a) => a.url),
    reason: `the last ${ZERO_IMPRESSION_STREAK} articles have been indexed for ${ZERO_IMPRESSION_INDEXED_DAYS}+ days without a single Search Console impression`,
  };
}

// --- Research filtering -------------------------------------------------------

export const MIN_VOLUME = 50;
export const DUPLICATE_JACCARD = 0.6;
/** How many approved guide ideas the autopilot keeps queued, at least.
 *  Research tops the queue back up to this and never past it. A plan that
 *  writes more a week keeps two weeks' worth, so one failed weekly research
 *  (DataForSEO down, budget spent) never leaves a 5-a-week site dry. */
export const TARGET_APPROVED_IDEAS = 6;
export function targetApprovedIdeas(articlesPerWeek: number): number {
  return Math.max(TARGET_APPROVED_IDEAS, 2 * Math.max(0, Math.floor(articlesPerWeek)));
}

export type Candidate = {
  keyword: string;
  volume: number;
  kd: number | null;
  detectedLanguage: string | null;
  isAnotherLanguage: boolean | null;
};

export type FilterContext = {
  kdCeiling: number;
  languageCode: string;
  blockedTopics: string[];
  /** Normalized keywords already used by this project (ideas, pages, drafts). */
  takenKeywords: Set<string>;
  /** Titles and keywords to near-duplicate check against. */
  existingTexts: string[];
  /** Override of MIN_VOLUME for research's one widened retry. */
  minVolume?: number;
  /** The capped page types this run may still queue (pageTypeRoom); taken
   *  as ideas are kept. Absent = no caps (self-promo is blocked regardless). */
  pageTypeRoom?: PageTypeRoom;
};

/** Research's one widened pass when the normal filter keeps nothing (audit
 *  H9): a young site in a small niche often has no keyword at volume 50 under
 *  its KD ceiling, and "nothing, retry next week" forever is a stalled
 *  customer. Five more KD points and volume 20 is still a winnable,
 *  searched keyword - and it is applied once, never compounded. */
export const WIDEN_KD_BY = 5;
export const WIDEN_MIN_VOLUME = 20;
/** Research's second widening (the thin-market ladder's rung 3), same raw
 *  rows, same +5 KD: in a small language a 10-a-month query is a real reader,
 *  and DataForSEO under-reports the Hebrew/Thai/etc. long tail - Paperbot's
 *  four runs on 2026-10-24 dropped 60-70% of their candidates under 50. */
export const WIDEN2_MIN_VOLUME = 10;
// There is no unmeasured lane (owner, 2026-10-24: "we NEED volume and KD, no
// guessing"): every queued idea has a measured monthly volume at or above its
// rung's floor and a measured KD. The thin-market ladder only widens where
// research LOOKS (more seeds); DataForSEO supplies every number.

/** Research back-off (the wider search costs Labs credits; a thin niche
 *  that keeps finding nothing must not buy them every two days). In back-off
 *  - the last two completed runs both added 0 ideas - rung 4 does not run at
 *  all until research_backoff_until (one weekly interval after the run that
 *  entered back-off), and then runs on WIDER_LABS_CALLS_BACKOFF billed Labs
 *  calls instead of WIDER_LABS_CALLS. Rungs 1-3 always run: their seeds are
 *  cached for 30 days, so an early refill there costs next to nothing. */
export const WIDER_LABS_CALLS = 20;
export const WIDER_LABS_CALLS_BACKOFF = 6;

export type BackoffState = { recent_added: number[]; research_backoff_until: string | null };

export function inResearchBackoff(s: BackoffState): boolean {
  return s.recent_added.length >= 2 && s.recent_added[0] === 0 && s.recent_added[1] === 0;
}

/** May this run use rung 4, and on how many billed Labs calls. */
export function widerSearchAllowance(s: BackoffState, nowMs: number): { allowed: true; labsCalls: number } | { allowed: false; why: string } {
  if (!inResearchBackoff(s)) return { allowed: true, labsCalls: WIDER_LABS_CALLS };
  if (s.research_backoff_until && nowMs < Date.parse(s.research_backoff_until)) {
    return { allowed: false, why: `the last two research runs added nothing, so the wider search waits until ${s.research_backoff_until}` };
  }
  return { allowed: true, labsCalls: WIDER_LABS_CALLS_BACKOFF };
}

/** The state after a completed run that added `added` ideas. Entering (or
 *  still being in) back-off with no wait running starts one: rung 4 rests for
 *  `everyMs`. Leaving back-off clears it. */
export function nextBackoffState(s: BackoffState, added: number, nowMs: number, everyMs: number): BackoffState {
  const recent = [added, ...s.recent_added].slice(0, 2);
  const next = { recent_added: recent, research_backoff_until: null as string | null };
  if (!inResearchBackoff(next)) return next;
  const waiting = s.research_backoff_until && nowMs < Date.parse(s.research_backoff_until);
  next.research_backoff_until = waiting ? s.research_backoff_until : new Date(nowMs + everyMs).toISOString();
  return next;
}

export type DropReason = "volume" | "kd" | "language" | "blocked" | "duplicate" | "near-duplicate";

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Light plural folding so "running shoe" blocks "running shoes". */
function stem(t: string): string {
  return t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t;
}

/**
 * Does `keyword` fall under an owner-blocked topic? A topic matches when every
 * word of it appears in the keyword (in any order, plurals folded): blocking
 * "crypto" blocks "best crypto wallets"; blocking "free trial" does not block
 * "free templates". Word-level on purpose - a substring test would let
 * blocking "ai" block every keyword containing "paint".
 */
export function matchesBlockedTopic(keyword: string, blocked: string[]): string | null {
  const kw = new Set(tokens(keyword).map(stem));
  for (const topic of blocked) {
    const words = tokens(topic).map(stem);
    if (words.length && words.every((w) => kw.has(w))) return topic;
  }
  return null;
}

function languageOk(c: Candidate, languageCode: string): boolean {
  if (c.isAnotherLanguage === true) return false;
  if (!c.detectedLanguage) return true;
  return c.detectedLanguage.toLowerCase().split(/[-_]/)[0] === languageCode.toLowerCase().split(/[-_]/)[0];
}

/** Order the survivors by the traffic they can realistically win. */
export function opportunity(c: Pick<Candidate, "volume" | "kd">): number {
  return c.volume * (1 - Math.min(100, Math.max(0, c.kd ?? 50)) / 100);
}

/**
 * Merge, dedupe and filter the raw keyword candidates, cheapest checks first,
 * so the judge only sees keywords code could not rule out. Returns the kept
 * candidates best-first and a count per reason for the run log.
 */
export function filterCandidates(
  raw: Candidate[],
  ctx: FilterContext,
): { kept: Candidate[]; dropped: Record<DropReason, number> } {
  const dropped: Record<DropReason, number> = { volume: 0, kd: 0, language: 0, blocked: 0, duplicate: 0, "near-duplicate": 0 };
  const seen = new Map<string, Candidate>();
  for (const c of raw) {
    const key = normalizeKeyword(c.keyword);
    if (!key) continue;
    const prev = seen.get(key);
    // The same keyword from two seeds: keep the row with the known KD.
    if (!prev || (prev.kd === null && c.kd !== null)) seen.set(key, { ...c, keyword: key });
  }
  const kept: Candidate[] = [];
  const keptTexts: string[] = [];
  for (const c of seen.values()) {
    // Page-type guards first: a self-promotional shape is never worth the
    // rest of the checks (and never worth a KD lookup - kdRecoveryKeys).
    const type = pageTypeOf(c.keyword);
    if (type === "self-promo") { dropped.blocked++; continue; }
    if (!(c.volume >= (ctx.minVolume ?? MIN_VOLUME))) { dropped.volume++; continue; }
    // Unknown KD is not "easy": DataForSEO leaves it empty on thin data, and
    // a young site cannot afford to guess.
    if (c.kd === null || c.kd > ctx.kdCeiling) { dropped.kd++; continue; }
    if (!languageOk(c, ctx.languageCode)) { dropped.language++; continue; }
    if (matchesBlockedTopic(c.keyword, ctx.blockedTopics)) { dropped.blocked++; continue; }
    if (ctx.takenKeywords.has(c.keyword)) { dropped.duplicate++; continue; }
    // Near-duplicates of what the site has AND of what this batch already
    // kept: "how to choose a crm" and "how to choose crm software" are one
    // article (word overlap 0.67).
    const against = [...ctx.existingTexts, ...keptTexts];
    if (against.some((t) => jaccard(t, c.keyword) >= DUPLICATE_JACCARD)) { dropped["near-duplicate"]++; continue; }
    // The capped shapes take room only once everything else passed; the room
    // lives on the context, so it holds across every rung of one run.
    if (ctx.pageTypeRoom && type === "versus") {
      if (ctx.pageTypeRoom.versus <= 0) { dropped.blocked++; continue; }
      ctx.pageTypeRoom.versus--;
    }
    if (ctx.pageTypeRoom && (type === "glossary" || type === "listicle")) {
      if (ctx.pageTypeRoom.listLike <= 0) { dropped.blocked++; continue; }
      ctx.pageTypeRoom.listLike--;
    }
    kept.push(c);
    keptTexts.push(c.keyword);
  }
  kept.sort((a, b) => opportunity(b) - opportunity(a) || b.volume - a.volume);
  return { kept, dropped };
}

/**
 * KD recovery (research): the keywords that would fail filterCandidates ONLY
 * for an unknown KD at this floor - measured volume >= the floor, KD null on
 * every row of it, the site's language, not blocked, not already the site's.
 * Best volume first, at most `cap`: those are the rows worth one
 * bulk_keyword_difficulty call. Anything else is dropped whatever its KD.
 */
export function kdRecoveryKeys(raw: Candidate[], ctx: FilterContext, cap: number): string[] {
  const scored = new Set(raw.filter((c) => c.kd !== null).map((c) => normalizeKeyword(c.keyword)));
  const best = new Map<string, number>();
  for (const c of raw) {
    const k = normalizeKeyword(c.keyword);
    if (!k || c.kd !== null || scored.has(k)) continue;
    if (!(c.volume >= (ctx.minVolume ?? MIN_VOLUME))) continue;
    if (pageTypeOf(k) === "self-promo" || !languageOk(c, ctx.languageCode) || matchesBlockedTopic(k, ctx.blockedTopics) || ctx.takenKeywords.has(k)) continue;
    best.set(k, Math.max(best.get(k) ?? 0, c.volume));
  }
  return [...best.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(0, cap))
    .map(([k]) => k);
}

/** The raw rows with every recovered KD filled in (keyed by normalized
 *  keyword), and how many distinct keywords got one. A KD the lookup did not
 *  return stays null, and filterCandidates drops that row. */
export function fillKd(raw: Candidate[], kd: Map<string, number | null>): { rows: Candidate[]; recovered: number } {
  const filled = new Set<string>();
  const rows = raw.map((c) => {
    if (c.kd !== null) return c;
    const k = normalizeKeyword(c.keyword);
    const v = kd.get(k);
    if (typeof v !== "number") return c;
    filled.add(k);
    return { ...c, kd: v };
  });
  return { rows, recovered: filled.size };
}

/** 0.6 let "expat families" (fit 0.69) through for a tutoring site
 *  (2026-11-01). The fit question now asks whether a BUYER of the site
 *  would type it, and the bar sits at 0.7: a thin queue is honest, an
 *  off-audience article is a wasted slot and a Google signal in the wrong
 *  direction. */
export const FIT_MIN = 0.7;
export const EVERGREEN_MIN = 0.5;
export const ACCEPTED_INTENTS = ["informational", "commercial"] as const;

export type JudgedCandidate = { fit: number; intent: string | null; evergreen: number; /** the article would pitch the site against its competitors (0-1) */ pitch?: number };

/** At or above this, the judge says the page pitches the site against its
 *  competitors: refused whatever else it scores (page-type guards below). */
export const PITCH_MAX = 0.5;

/** The judge's answers, read with the spec's thresholds. */
export function passesJudge(j: JudgedCandidate): boolean {
  return j.fit >= FIT_MIN && (ACCEPTED_INTENTS as readonly string[]).includes(j.intent ?? "") && j.evergreen >= EVERGREEN_MIN && (j.pitch ?? 0) < PITCH_MAX;
}

// --- Page-type guards ----------------------------------------------------------
//
// The page shapes a spam update reads as "exists because a template could
// produce it" (2026-11-08 research on dispatchseo.com's August demotion: 11 of
// 17 posts were "<competitor> alternative" pages, plus self-promotional "best
// X tools" lists; Lily Ray's 2026 study names the same templates). Enforced
// here in code, on every keyword research produces (model proposals and
// DataForSEO expansions alike), not left to a prompt line:
//   self-promo   alternatives / competitors / best-or-top tools, software,
//                apps / "top 10" lists - never queued;
//   versus       a neutral "X vs Y" - none in a site's first 8 weeks, then at
//                most one per 4 weeks (ClockedCode's comparisons that worked
//                were neutral and rare);
//   glossary     "what is X" - with listicles, at most 2 of any 10 ideas;
//   listicle     "best ...", "N ways/tips/ideas ..." - same shared cap.

export type PageType = "self-promo" | "versus" | "glossary" | "listicle";

export function pageTypeOf(keyword: string): PageType | null {
  const k = keyword.toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(alternatives?|competitors?)\b/.test(k)) return "self-promo";
  if (/\b(best|top)\b.*\b(tools?|software|apps?|platforms?|plugins?|extensions?|saas|services)\b/.test(k)) return "self-promo";
  if (/\btop\s+\d+\b/.test(k)) return "self-promo";
  if (/\b(vs\.?|versus)\b/.test(k)) return "versus";
  if (/^(what\s+(is|are|does)|meaning\s+of|definition\s+of)\b/.test(k)) return "glossary";
  // Hebrew sites (paperbot's glossary run, 2026-11-08). JS \b is ASCII-only,
  // so Hebrew words are bounded by whitespace or the string ends instead.
  const he = (re: string) => new RegExp(`(^|\\s)(${re})(\\s|$)`).test(k);
  if (he("חלופות|חלופה|אלטרנטיבות|אלטרנטיבה|מתחרים")) return "self-promo";
  if (/(^|\s)(ה)?(כלים|תוכנות|תוכנה|אפליקציות|אפליקציה|מערכות|פלטפורמות)(\s.*)?\s(ה)?(טובים|טובות|מומלצים|מומלצות)(\s|$)/.test(k)) return "self-promo";
  if (he("לעומת") || /^מה\s+ההבדל\s+בין(\s|$)/.test(k)) return "versus";
  if (/^(מה\s+(זה|זו|זאת|הם|הן|הוא|היא)|מהו|מהי|מהם|מהן|הגדרה\s+של|הגדרת|פירוש|משמעות)(\s|$)/.test(k)) return "glossary";
  if (/\d+\s+(דרכים|טיפים|רעיונות|סיבות|דוגמאות|טעויות)(\s|$)/.test(k) || he("הטובים ביותר|הטובות ביותר")) return "listicle";
  // "best time to ..." / "best way to ..." are questions, not lists.
  if (/^(best|top)\b(?!\s+(time|way|age|place|month|season|day|temperature|setting|size)s?\b)/.test(k) || /\b\d+\s+(best|ways|tips|ideas|reasons|examples|mistakes)\b/.test(k)) return "listicle";
  return null;
}

/** How many more capped page types this research run may queue for a site. */
export type PageTypeRoom = { versus: number; listLike: number };

/** Weeks a site must have before its first "X vs Y". */
export const VERSUS_MIN_AGE_DAYS = 56;
/** Days between two "X vs Y" ideas on one site. */
export const VERSUS_EVERY_DAYS = 28;
/** Glossary + listicle ideas allowed among a site's last LIST_WINDOW. */
export const LIST_LIKE_MAX = 2;
export const LIST_WINDOW = 10;

/** The room, from the site's age and its recent ideas (newest first). */
export function pageTypeRoom(siteAgeDays: number, recent: Array<{ keyword: string; createdAt: string }>, now: Date): PageTypeRoom {
  const versusRecently = recent.some((r) => pageTypeOf(r.keyword) === "versus" && now.getTime() - Date.parse(r.createdAt) < VERSUS_EVERY_DAYS * DAY_MS);
  const versus = siteAgeDays < VERSUS_MIN_AGE_DAYS || versusRecently ? 0 : 1;
  const listLike = recent.slice(0, LIST_WINDOW).filter((r) => {
    const t = pageTypeOf(r.keyword);
    return t === "glossary" || t === "listicle";
  }).length;
  return { versus, listLike: Math.max(0, LIST_LIKE_MAX - listLike) };
}

/** "best crm for startups" -> "Best crm for startups": the working title an
 *  idea carries until the planner writes the real one. */
export function sentenceTitle(keyword: string): string {
  const k = keyword.trim().replace(/\s+/g, " ");
  return k ? k[0].toUpperCase() + k.slice(1) : k;
}

/** How many ideas the visible queue (status approved, what the writer takes
 *  next and what the owner sees) is short of its target. */
export function ideasNeeded(approvedGuideCount: number, articlesPerWeek = 0): number {
  return Math.max(0, targetApprovedIdeas(articlesPerWeek) - approvedGuideCount);
}

/** The backlog behind the visible queue (owner, 2026-11-05: "copy what the
 *  autobloggers do" - they build a deep keyword list at onboarding and drain
 *  it, so running dry never comes up). Research fills the site's live ideas
 *  (approved + pending) up to this many measured keywords; the extra ones
 *  wait as `pending` and are promoted into the visible queue as it drains
 *  (research.ts promoteBacklog). Internal: the owner never sees the backlog. */
export const BACKLOG_TARGET = 100;
/** Research refills the backlog when it holds less than this many weeks of
 *  the plan's articles. */
export const BACKLOG_REFILL_WEEKS = 4;
/** ...and fills it to this many weeks of the plan's articles (owner,
 *  2026-11-09): 8 weeks is 24 ideas for a 3-a-week site. The flat 100 above
 *  stays as the hard ceiling (and promoteBacklog's read window), but as a
 *  TARGET it meant `needed` was always ~90, so every run bought the full
 *  eight seeds plus the wider search for a queue that only ever drains three
 *  a week - keyword data cost 6x the writer per article (paperbot, Oct-Nov
 *  2026: $4.26 of DataForSEO for 14 articles). */
export const BACKLOG_FILL_WEEKS = 8;
export const BACKLOG_FILL_MIN = 8;
/** The free tier's backlog: four months of its two articles a month, the
 *  same floor a Starter site gets (BACKLOG_FILL_MIN). It was 24 until
 *  2026-11-09, three times a paid site's, so a free site's first research
 *  could spend most of its $0.30 DataForSEO month before its first article. */
export const FREE_BACKLOG_TARGET = BACKLOG_FILL_MIN;
export function backlogTarget(articlesPerWeek: number, free: boolean): number {
  if (free) return FREE_BACKLOG_TARGET;
  const weeks = BACKLOG_FILL_WEEKS * Math.max(0, Math.floor(articlesPerWeek));
  return Math.min(BACKLOG_TARGET, Math.max(BACKLOG_FILL_MIN, weeks));
}
export function backlogNeeded(liveIdeaCount: number, target = BACKLOG_TARGET): number {
  return Math.max(0, target - liveIdeaCount);
}
/** An early (queue-short) research run may only go ahead when research is
 *  still finding things. The judge rejects most candidates on a thin niche
 *  (paperbot: 267 of 278 in 30 days), so a short queue used to re-buy eight
 *  seeds of Labs data every other day for one or two kept ideas. When the
 *  last two runs each kept at most one idea, the early run waits for the
 *  weekly one; the weekly run is never gated here. */
export const EARLY_RESEARCH_FLOOR_DAYS = 4;
export const EARLY_RESEARCH_MIN_RECENT_ADDED = 2;
export function earlyResearchAllowed(s: BackoffState): boolean {
  if (s.recent_added.length < 2) return true;
  return s.recent_added[0] >= EARLY_RESEARCH_MIN_RECENT_ADDED || s.recent_added[1] >= EARLY_RESEARCH_MIN_RECENT_ADDED;
}
export function backlogShort(liveIdeaCount: number, articlesPerWeek: number): boolean {
  return liveIdeaCount < Math.max(4, BACKLOG_REFILL_WEEKS * Math.max(0, Math.floor(articlesPerWeek)));
}

// --- Owner input --------------------------------------------------------------

export const BLOCKED_TOPICS_MAX = 50;
export const BLOCKED_TOPIC_MAX_CHARS = 80;

/** Trim, collapse, dedupe (case-insensitive), drop empties; error past 50. */
export function cleanTopicList(raw: unknown): { topics: string[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "Send a list of topics." };
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const t = item.trim().replace(/\s+/g, " ");
    if (!t) continue;
    if (t.length > BLOCKED_TOPIC_MAX_CHARS) return { error: `"${t.slice(0, 30)}..." is longer than ${BLOCKED_TOPIC_MAX_CHARS} characters. Use a short topic, like "crypto" or "competitor names".` };
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  if (out.length > BLOCKED_TOPICS_MAX) return { error: `At most ${BLOCKED_TOPICS_MAX} topics. Merge similar ones into a broader word.` };
  return { topics: out };
}

export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

// --- Health (what makes a hosted site's run loud) ------------------------------

/** After an owner resumes, the collapse rule sits out this long: the 35-day
 *  window it reads still contains the very collapse they just acknowledged. */
export const RESUME_GRACE_DAYS = 28;
/** A new site is allowed this long to produce its first article quietly. */
export const NEW_SITE_QUIET_DAYS = 7;
/** No article for this long on an active, unpaused site is a regression. */
export const NO_ARTICLE_ALARM_DAYS = 14;
/** This many failed runs in a row (past pick) is a broken pipeline. */
export const FAILURE_STREAK_ALARM = 2;

export function withinResumeGrace(resumedAt: string | null, now: Date): boolean {
  return Boolean(resumedAt) && now.getTime() - Date.parse(resumedAt!) < RESUME_GRACE_DAYS * DAY_MS;
}

/** Leading failed runs, newest first, ignoring runs refused at pick (those
 *  never cost a real article and say nothing about the pipeline) and topics
 *  the writer PARKED on purpose (failure_kind "content": too few readable
 *  sources, already ranks, no gain to add). A park is the gate working, not
 *  the pipeline breaking - counting it put "the last 2 articles failed" on a
 *  site whose writer was doing exactly its job. */
export function consecutivePostPickFailures(runs: Array<{ status: string; stage: string; failure_kind?: string | null }>): number {
  let n = 0;
  for (const r of runs) {
    if (r.status === "failed" && r.stage === "pick") continue;
    if (r.status === "failed" && r.failure_kind === "content") continue;
    if (r.status !== "failed") break;
    n++;
  }
  return n;
}

/**
 * Should "no article lately" be loud? Only once the site has had its quiet
 * week since setup finished, and only when nothing has started in two weeks
 * (a site that never produced anything counts from the start).
 */
export function noArticleAlarm(input: { connectedAt: string | null; lastArticleAt: string | null; now: Date }): boolean {
  const { connectedAt, lastArticleAt, now } = input;
  if (!connectedAt) return false;
  if (now.getTime() - Date.parse(connectedAt) < NEW_SITE_QUIET_DAYS * DAY_MS) return false;
  if (!lastArticleAt) return true;
  return now.getTime() - Date.parse(lastArticleAt) >= NO_ARTICLE_ALARM_DAYS * DAY_MS;
}

// --- Sub-topic spacing -----------------------------------------------------------
//
// At most one article per narrow sub-topic every SUBTOPIC_SPACING_DAYS: five of
// ClockedCode's seven newest engine articles were CLAUDE.md pieces, and Google
// indexed one (2026-11-08 URL Inspection) - near-duplicate intent read as scaled
// sameness. Two keywords share a sub-topic when they share a DISTINCTIVE word
// (one that few of the site's ideas use, so "claude" on a Claude Code site never
// counts but "md" does) or overlap heavily overall.

export const SUBTOPIC_SPACING_DAYS = 21;
const SUBTOPIC_STOP = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "how", "what", "why", "when", "is", "are", "do", "does", "can", "your", "you", "my", "vs", "guide", "best", "explained", "tips", "use", "uses", "using"]);

function subtopicTokens(keyword: string): string[] {
  return [...new Set(normalizeKeyword(keyword).split(" ").filter((w) => w.length >= 2 && !SUBTOPIC_STOP.has(w)))];
}

/** The words of a site's corpus that are distinctive (used by at most 20% of
 *  it); null when the corpus is too small to tell. */
export function distinctiveWords(corpus: string[]): Set<string> | null {
  if (corpus.length < 5) return null;
  const df = new Map<string, number>();
  for (const k of corpus) for (const w of subtopicTokens(k)) df.set(w, (df.get(w) ?? 0) + 1);
  return new Set([...df].filter(([, n]) => n / corpus.length <= 0.2).map(([w]) => w));
}

export function sameSubtopic(a: string, b: string, distinctive: Set<string> | null): boolean {
  const x = subtopicTokens(a);
  const y = new Set(subtopicTokens(b));
  const shared = x.filter((w) => y.has(w));
  // With a corpus to tell what is distinctive, only distinctive words count:
  // "claude code X" and "claude code Y" share nothing on a Claude Code site.
  if (distinctive) return shared.some((w) => distinctive.has(w));
  const union = new Set([...x, ...y]).size;
  return union > 0 && shared.length / union >= 0.5;
}
