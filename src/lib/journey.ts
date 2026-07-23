import { db } from "./db";
import { siteAgeDays } from "./pacing";
import type { Project } from "./projects";
import type { AnalyticsOverview } from "./analytics-data";

// The progress story (docs-private/DASHBOARD_PROGRESS.md): where a site is on the SEO
// timeline, told honestly. SEO shows nothing for the first two months - the
// journey stage supplies the context that makes "no traffic yet" read as an
// expected checkpoint instead of a failure. Two rules govern everything here:
//
//   1. Never manufacture movement. Stage and milestones derive only from
//      first-ever events and cumulative counts, all of which are monotonic -
//      a bad GSC week can never demote a site back to Foundation.
//   2. "No data because GSC isn't connected" is NOT Foundation. Telling a
//      disconnected site "impressions come around month 2-3" would be the
//      manufactured comfort the honesty rule bans - it gets its own stage
//      that says to connect GSC instead.

// Stage vocabulary lives in journey-meta.ts (client-safe, no db import) so
// the onboarding wizard can share the exact words - the MCP parity rule
// applied to copy. Re-exported here for server-side consumers.
import {
  JOURNEY_STAGES,
  STAGE_META,
  SETUP_WAITING_EXPECTATION,
  type JourneyStageKey,
} from "./journey-meta";
import { gscCronReadiness } from "./gsc-readiness";
import { isCloudMode } from "./cloud";

export { JOURNEY_STAGES, STAGE_META, type JourneyStageKey };

export type Milestone = {
  key: string;
  label: string;
  achieved_at: string | null; // ISO timestamp or YYYY-MM-DD (GSC dates)
};

export type Journey = {
  stage: JourneyStageKey;
  stage_label: string;
  months_hint: string | null; // "months 4-7" - when this stage TYPICALLY runs
  month: number; // 1-based month of site age
  site_age_days: number;
  expectation: string; // the honest one-liner for the stage
  // Set when the data says the site reached this stage earlier than the
  // typical timeline - the "month 2 but already earning clicks" case reads
  // as a contradiction unless it's named as being ahead.
  ahead_of_schedule: boolean;
  pace_note: string | null; // plain-English framing of ahead_of_schedule
  next_milestone: string | null; // label of the next first-time moment to watch
  milestones: Milestone[];
  fresh_milestones: Milestone[]; // achieved within the last 7 days
  gsc_connected: boolean;
  // True only in the "setup" stage when the readiness probe says the GSC
  // connection works but Google has no rows yet - the banner then says
  // "waiting on Google, nothing needs you" and drops its settings link.
  gsc_waiting: boolean;
};

const earliest = (dates: Array<string | null | undefined>): string | null => {
  let min: string | null = null;
  for (const d of dates) {
    if (d && (min == null || new Date(d).getTime() < new Date(min).getTime())) min = d;
  }
  return min;
};

// Pure derivation - callers supply the overview the page already fetched plus
// the one number it lacks (first-ever top-10 rank check; the overview only
// carries the last 30 days of checks).
export function computeJourney(
  project: Project,
  overview: AnalyticsOverview,
  firstTop10At: string | null,
): Journey {
  const pages = [...overview.guides, ...overview.tools];
  const daily = overview.gscDaily; // ascending by date

  const firstLive = earliest(pages.map((p) => p.published_at ?? p.created_at));
  const firstIndexed = earliest(pages.map((p) => p.indexed_at));
  const firstImpression =
    daily.find((r) => (r.impressions ?? 0) > 0)?.date ?? null;
  const firstClick = daily.find((r) => (r.clicks ?? 0) > 0)?.date ?? null;

  let click100: string | null = null;
  let totalClicks = 0;
  for (const r of daily) {
    totalClicks += r.clicks ?? 0;
    if (click100 == null && totalClicks >= 100) click100 = r.date;
  }

  const ageDays = siteAgeDays(project);
  // "Connected" means the pipe has actually delivered data, not that a
  // property string exists - onboarding GUESSES sc-domain:<domain> for every
  // project, so the string is set long before the owner grants access. Keying
  // the stage off the string put not-yet-granted projects in "foundation"
  // ("impressions come around month 2-3") - exactly the manufactured comfort
  // rule 2 above bans, while the setup card on the same page said the
  // opposite. Data rows are the same signal the setup card and the cron
  // readiness gate use, so all three surfaces tell one story.
  const gscConnected = daily.length > 0;

  // Ordered so every input only ever moves forward: firsts don't un-happen,
  // age and cumulative clicks only grow. Real data (even from a since-broken
  // GSC hookup) beats the setup nag - measured history is still history.
  const stage: JourneyStageKey = firstImpression
    ? firstClick
      ? ageDays >= 180 && totalClicks >= 100
        ? "compounding"
        : "traction"
      : "first_signals"
    : gscConnected
      ? "foundation"
      : "setup";

  const milestones: Milestone[] = [
    { key: "first_page_live", label: "First page live", achieved_at: firstLive },
    { key: "first_page_indexed", label: "First page indexed by Google", achieved_at: firstIndexed },
    { key: "first_impression", label: "First appearance in Google results", achieved_at: firstImpression },
    { key: "first_click", label: "First click from Google", achieved_at: firstClick },
    { key: "first_top10", label: "First top-10 ranking", achieved_at: firstTop10At },
    { key: "click_100", label: "100th click from Google", achieved_at: click100 },
  ];

  const weekAgo = Date.now() - 7 * 86400000;
  const meta = STAGE_META[stage];
  const month = Math.max(1, Math.floor(ageDays / 30) + 1);

  // The months in STAGE_META are the typical schedule; the stage itself comes
  // from real data. When the data runs ahead of the schedule, say so - month 2
  // next to "months 4-7" reads as a contradiction until it's named as early.
  const ahead = meta.startMonth != null && month < meta.startMonth;
  const paceNote = ahead
    ? `Month ${month} and already in the ${meta.label} stage - ahead of the typical timeline (${meta.months}).`
    : null;

  return {
    stage,
    stage_label: meta.label,
    months_hint: meta.months,
    month,
    site_age_days: ageDays,
    expectation: meta.expectation,
    ahead_of_schedule: ahead,
    pace_note: paceNote,
    next_milestone: milestones.find((m) => m.achieved_at == null)?.label ?? null,
    milestones,
    fresh_milestones: milestones.filter(
      (m) => m.achieved_at != null && new Date(m.achieved_at).getTime() >= weekAgo,
    ),
    gsc_connected: gscConnected,
    gsc_waiting: false,
  };
}

export async function getJourney(
  project: Project,
  overview: AnalyticsOverview,
): Promise<Journey> {
  // First-ever top-10 rank. Tolerant like projects.ts: a query error just
  // means the milestone shows unachieved, never a dead page.
  let firstTop10: string | null = null;
  const { data, error } = await db()
    .from("rank_checks")
    .select("checked_at")
    .eq("project_id", project.id)
    .lte("position", 10)
    .order("checked_at", { ascending: true })
    .limit(1);
  if (!error && data?.[0]) firstTop10 = (data[0] as { checked_at: string }).checked_at;
  const journey = computeJourney(project, overview, firstTop10);

  // "Setup" covers both not-connected and connected-but-Google-has-nothing.
  // The readiness probe (same one the crons gate on) tells them apart; the
  // waiting case swaps in copy that asks for nothing instead of sending the
  // owner back to a step they finished. Probe failures leave the setup nag
  // as-is - the honest default when we can't verify.
  if (journey.stage === "setup") {
    // Cloud connects GSC through per-project OAuth, not the shared service
    // account - so the service-account readiness probe (gscCronReadiness) is
    // blind to it and would wrongly nag "finish the Connect Search Console
    // step" (with an Open-Settings link) on a project that's already connected
    // and just waiting for its first sync. Mirror the Home setup card, which
    // already treats an OAuth-connected cloud property as the waiting state.
    const cloudGscConnected =
      isCloudMode() &&
      Boolean(project.gsc_oauth_refresh_token) &&
      Boolean(project.gsc_site_url);
    if (cloudGscConnected) {
      journey.gsc_waiting = true;
      journey.expectation = SETUP_WAITING_EXPECTATION;
    } else {
      try {
        const readiness = await gscCronReadiness(project.id, project.gsc_site_url);
        if (readiness.ready) {
          journey.gsc_waiting = true;
          journey.expectation = SETUP_WAITING_EXPECTATION;
        }
      } catch {
        // keep the setup copy
      }
    }
  }
  return journey;
}
