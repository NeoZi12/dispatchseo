import { db } from "./db";
import type { Project } from "./projects";

// Publishing pace: at most ONE guide per UTC calendar day. Flat, no memory.
//
// History (2026-07-19): this replaced an age-based weekly budget with a
// rolling 7-day window. The window's only real-world effect was burst
// payback - a launch-week blast silenced the builder for days while approved
// ideas sat queued. Researched before replacing: Google has said for a decade
// (restated the same week as the March 2024 scaled-content policy) that
// velocity itself is neither a ranking nor a spam signal - low value-per-page
// at scale is, and that risk is carried by the sameness / thin-content / SERP
// gates, not by the calendar. Real products (SEObot, Outrank, Trendly,
// Publish Owl) all ship a flat daily cap or drip queue; none claw back budget
// after a good day. So: one guide a day, steady, forever.
//
// The cap is SITE-level, not agent-level - Google sees the site's total
// publishing rate, so a guide the owner merges by hand uses the day's slot
// and the builder resumes the next morning.

export const GUIDES_PER_DAY = 1;

// Age of the live site (from projects.site_launched_at, owner-correctable on
// Settings - NOT from when the project joined DispatchSEO). No longer drives
// the pace; still shown on the Journey page.
export function siteAgeDays(p: Project): number {
  const launched = p.site_launched_at ?? p.created_at;
  const ms = Date.now() - new Date(launched).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

export type Pacing = {
  site_age_days: number;
  // Informational only - the dashboard's "N shipped in the last 7 days" line.
  guides_built_last_7d: number;
  days_since_last_guide: number | null;
  build_allowed: boolean;
  // Human sentence for agent run reports and the dashboard subline.
  note: string;
};

// The live pacing verdict: has today's slot been used? Fails OPEN on a query
// error - a DB hiccup must not silently halt every builder.
export async function getPacing(p: Project): Promise<Pacing> {
  const ageDays = siteAgeDays(p);

  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("pages")
    .select("published_at")
    .eq("project_id", p.id)
    .eq("type", "guide")
    .order("published_at", { ascending: false })
    .limit(50);

  let built7d = 0;
  let daysSinceLast: number | null = null;
  if (!error && data) {
    const rows = data as { published_at: string | null }[];
    built7d = rows.filter((r) => r.published_at && r.published_at >= weekAgo).length;
    const latest = rows.find((r) => r.published_at)?.published_at;
    if (latest) {
      // Calendar-day difference, not floor(elapsed/24h): GitHub cron jitter
      // means today's run can fire EARLIER in the day than yesterday's build
      // finished, and elapsed-hours math would call that "0 days ago" and
      // block a perfectly paced daily cadence.
      const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      daysSinceLast = Math.round((utcDay(new Date()) - utcDay(new Date(latest))) / 86_400_000);
    }
  }

  const allowed = error ? true : daysSinceLast == null || daysSinceLast >= 1;

  const note = error
    ? "Pacing data unavailable (query failed) - proceeding without the pace gate."
    : allowed
      ? daysSinceLast == null
        ? "No guide has shipped yet - today's slot is free, building is allowed."
        : `Today's slot is free (last guide shipped ${daysSinceLast} day(s) ago; the pace is one guide per day) - building is allowed today.`
      : "A guide already shipped today (the pace is one guide per day, the owner's own merges included) - do not build again today; the next slot opens tomorrow.";

  return {
    site_age_days: ageDays,
    guides_built_last_7d: built7d,
    days_since_last_guide: daysSinceLast,
    build_allowed: allowed,
    note,
  };
}
