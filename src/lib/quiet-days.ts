import type { Project } from "@/lib/projects";

// Quiet days: weekdays on which nothing of ours reaches a site.
//
// Built for an owner who keeps Shabbat (mia-tax, 2026-11-22: no article may
// go out on a Friday or a Saturday). A raw key inside projects.content_prefs,
// set by SQL only, like site_style and banned_claims - no migration, no MCP
// tool, no Settings row. Absent means every default is untouched.
//
//   quiet_days  { "days": [5, 6], "tz": "Asia/Jerusalem" }
//               days as Date.getDay() numbers (0 = Sunday ... 6 = Saturday)
//
// WHAT HOLDS, and where:
//   scheduler.ts       starts no article on a quiet day (a quiet skip)
//   publish.ts         a finished article waits; its publish job is queued
//                      again for the moment the hold lifts
//   verify.ts          an open article pull request is not merged
//   article-repair.ts  nor is a repair to a live article
//
// The publish job is the guarantee - every route (repo, blog store, hosted,
// WordPress) goes through it - and the merge hold covers the pull request
// that was opened on Thursday and turned green on Friday. Not starting is
// the courtesy on top: without it Friday's and Saturday's articles would
// all land together when the hold lifts.
//
// WHAT DOES NOT: anything the owner does by hand. Their own Publish (the
// draft's approved_at), Edit and Remove are their decision on their day,
// the same exception a paused site makes.
//
// A moment is quiet when its weekday is listed in the site's timezone OR in
// UTC. The second half is for the date we print: an article's frontmatter
// date is the UTC day it was published (repo-publish.ts), so one released at
// 00:30 on Sunday in Jerusalem would carry Saturday's date on the page. With
// both clocks checked, the hold for [5, 6] in Asia/Jerusalem runs from
// Friday 00:00 local to Sunday 00:00 UTC (02:00 or 03:00 local).

export type QuietDays = { days: number[]; tz: string };

/** The scheduler's skip on a quiet day. health.ts counts it as a normal one. */
export const QUIET_DAY_SKIP = "quiet day";

type Prefs = { content_prefs?: unknown };

const STEP_MS = 15 * 60_000; // every timezone's midnight falls on this grid
const LOOKAHEAD_MS = 8 * 86_400_000;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatters = new Map<string, Intl.DateTimeFormat | null>();
function weekdayFormat(tz: string): Intl.DateTimeFormat | null {
  if (!formatters.has(tz)) {
    let made: Intl.DateTimeFormat | null = null;
    try {
      made = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz });
    } catch {
      // An unknown timezone name: the UTC half of the rule still holds.
    }
    formatters.set(tz, made);
  }
  return formatters.get(tz) ?? null;
}

export function quietDaysOf(project: Prefs): QuietDays | null {
  const prefs = project.content_prefs;
  const raw = prefs && typeof prefs === "object" && !Array.isArray(prefs) ? (prefs as Record<string, unknown>).quiet_days : null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as { days?: unknown; tz?: unknown };
  const days = Array.isArray(o.days) ? [...new Set(o.days.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [];
  // All seven would hold every article for good: that is a pause, and the
  // pause has its own switch.
  if (days.length === 0 || days.length >= 7) return null;
  return { days, tz: typeof o.tz === "string" && o.tz.trim() ? o.tz.trim() : "UTC" };
}

function isQuietAt(q: QuietDays, at: Date): boolean {
  if (q.days.includes(at.getUTCDay())) return true;
  const local = weekdayFormat(q.tz);
  return local ? q.days.includes(DOW.indexOf(local.format(at))) : false;
}

/** Null when the site may publish at `at`; otherwise the first moment it may. */
export function quietUntil(project: Prefs, at: Date = new Date()): Date | null {
  const q = quietDaysOf(project);
  if (!q || !isQuietAt(q, at)) return null;
  let t = Math.floor(at.getTime() / STEP_MS) * STEP_MS + STEP_MS;
  // Bounded: a list that leaves no open moment keeps holding, a week at a
  // time, rather than reading as "not quiet".
  const end = t + LOOKAHEAD_MS;
  while (t < end && isQuietAt(q, new Date(t))) t += STEP_MS;
  return new Date(t);
}

/** `at`, or the moment the hold lifts when `at` falls on a quiet day. */
export function afterQuiet(project: Prefs, at: Date): Date {
  return quietUntil(project, at) ?? at;
}

/** Projected start dates (queue.ts) with the quiet days taken out: a start
 *  that lands on one moves to the day the hold lifts, and the ones behind it
 *  keep at least a day's distance. Display only. */
export function shiftPastQuiet(project: Prefs, starts: Date[]): Date[] {
  if (!quietDaysOf(project)) return starts;
  let last = -Infinity;
  return starts.map((d) => {
    let at = afterQuiet(project, d);
    if (at.getTime() < last + 86_400_000) at = afterQuiet(project, new Date(last + 86_400_000));
    last = at.getTime();
    return at;
  });
}
