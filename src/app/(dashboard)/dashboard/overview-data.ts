import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import type { AnalyticsOverview } from "@/lib/analytics-data";
import { getJourney, type Journey } from "@/lib/journey";
import { gscTag } from "@/lib/autopilot/report";

// What the hosted Home's overview card and journey road need, and nothing
// else: Google's daily totals (one light row a day) and the pages' publish
// and index dates. The journey's own helper derives the stage from exactly
// those (plus its two cheap first-ever reads). This replaced a call to the
// Analytics loader, which also read every keyword, up to 20k rank checks
// and 28 days of ~450 KB per-page JSON just to draw this card.
//
// Cached 10 minutes per project (tag gsc:<id>): the numbers only change
// when Google syncs, hourly at most. A failed read is never cached.

export type OverviewData = { journey: Journey | null; daily: Array<{ date: string; clicks: number; impressions: number }> };

// About three years of days: the "All time" range never needs more.
const MAX_DAYS = 1100;

export function loadOverviewData(project: Project): Promise<OverviewData> {
  return unstable_cache(
    async (): Promise<OverviewData> => {
      const [dailyRes, pagesRes] = await Promise.all([
        // Newest first with a limit, then re-sorted: ascending + limit would
        // pin the window to the oldest days ever collected.
        db().from("gsc_stats").select("date, clicks, impressions").eq("project_id", project.id).order("date", { ascending: false }).limit(MAX_DAYS),
        db().from("pages").select("id, url, title, type, primary_keyword, published_at, created_at, indexed_at").eq("project_id", project.id),
      ]);
      if (dailyRes.error) throw new Error(`could not read Google's daily numbers: ${dailyRes.error.message}`);
      const daily = ((dailyRes.data ?? []) as Array<{ date: string; clicks: number | null; impressions: number | null }>)
        .map((d) => ({ date: d.date, clicks: Number(d.clicks) || 0, impressions: Number(d.impressions) || 0 }))
        .reverse();
      // The journey reads only pages (guides + tools: their publish and
      // index dates) and the daily series from the overview it's given.
      const pages = pagesRes.error ? [] : (pagesRes.data ?? []);
      const light = { guides: pages, tools: [], gscDaily: daily } as unknown as AnalyticsOverview;
      const journey = await getJourney(project, light).catch(() => null);
      return { journey, daily };
    },
    ["hosted-overview", project.id],
    { revalidate: 600, tags: [gscTag(project.id)] },
  )();
}
