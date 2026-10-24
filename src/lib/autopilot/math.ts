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
 *  (Scale: five, Mon-Fri) - still one a day, never two. */
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
  const spacing = spacingDaysFor(quota);
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
  const spacing = spacingDaysFor(quota);
  const out: Date[] = [];
  // The daily run is at 05:30 UTC: once it has passed, today is no longer a
  // candidate (nothing starts twice in a day).
  const past = input.now.getUTCHours() > 5 || (input.now.getUTCHours() === 5 && input.now.getUTCMinutes() >= 40);
  let day = new Date(utcDay(input.now).getTime() + (past ? DAY_MS : 0));
  let week = weekStartUtc(day);
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
/** How many approved guide ideas the autopilot keeps queued. Research tops
 *  the queue back up to this and never past it. */
export const TARGET_APPROVED_IDEAS = 6;

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
};

/** Research's one widened pass when the normal filter keeps nothing (audit
 *  H9): a young site in a small niche often has no keyword at volume 50 under
 *  its KD ceiling, and "nothing, retry next week" forever is a stalled
 *  customer. Five more KD points and volume 20 is still a winnable,
 *  searched keyword - and it is applied once, never compounded. */
export const WIDEN_KD_BY = 5;
export const WIDEN_MIN_VOLUME = 20;

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
    kept.push(c);
    keptTexts.push(c.keyword);
  }
  kept.sort((a, b) => opportunity(b) - opportunity(a) || b.volume - a.volume);
  return { kept, dropped };
}

export const FIT_MIN = 0.6;
export const EVERGREEN_MIN = 0.5;
export const ACCEPTED_INTENTS = ["informational", "commercial"] as const;

export type JudgedCandidate = { fit: number; intent: string | null; evergreen: number };

/** The judge's three answers, read with the spec's thresholds. */
export function passesJudge(j: JudgedCandidate): boolean {
  return j.fit >= FIT_MIN && (ACCEPTED_INTENTS as readonly string[]).includes(j.intent ?? "") && j.evergreen >= EVERGREEN_MIN;
}

/** "best crm for startups" -> "Best crm for startups": the working title an
 *  idea carries until the planner writes the real one. */
export function sentenceTitle(keyword: string): string {
  const k = keyword.trim().replace(/\s+/g, " ");
  return k ? k[0].toUpperCase() + k.slice(1) : k;
}

/** How many new ideas research should add right now. */
export function ideasNeeded(approvedGuideCount: number): number {
  return Math.max(0, TARGET_APPROVED_IDEAS - approvedGuideCount);
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
