import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import type { Project } from "@/lib/projects";
import type { AnalyticsOverview } from "@/lib/analytics-data";
import { getJourney, type Journey } from "@/lib/journey";
import { gscTag } from "@/lib/autopilot/report";
import { pagePath } from "@/lib/metrics";
import { LANDED_RANGE_DAYS, type Landed, type LandedPage, type LandedRangeKey } from "@/components/ui/overview-pack";

// What the hosted Home's overview card and journey road need, and nothing
// else: Google's daily totals (one light row a day) and the pages' publish
// and index dates. The journey's own helper derives the stage from exactly
// those (plus its two cheap first-ever reads). This replaced a call to the
// Analytics loader, which also read every keyword, up to 20k rank checks
// and 28 days of ~450 KB per-page JSON just to draw this card.
//
// Cached 10 minutes per project (tag gsc:<id>): the numbers only change
// when Google syncs, hourly at most. A failed read is never cached.

export type OverviewData = {
  journey: Journey | null;
  daily: Array<{ date: string; clicks: number; impressions: number }>;
  /** The pages those clicks landed on, one ranked list per range of the card. */
  landed: Landed;
};

type PageRow = { page: string; clicks: number | null; impressions: number | null; position: number | null };

/** How many pages a range's list keeps: the card shows the top of it and
 *  folds the rest behind "Show all". */
const LANDED_CAP = 25;

/** A post, for the top-posts list: a page we built (an article or a free
 *  tool, in `known`), or anything that sits under a section the way a post
 *  does ("/blog/my-post", "/guides/x"). Not a post: the homepage and the
 *  site's own one-segment pages - "/privacy", "/blog", "/pricing". */
function isPost(path: string, known: Map<string, unknown>): boolean {
  return known.has(path) || path.split("/").filter(Boolean).length >= 2;
}

/** Fold the per-day page rows of [from, to] into one ranked list of the
 *  site's posts (isPost), grouped by pathname: clicks first, then
 *  impressions. Posts Google only showed count too, so a young site with
 *  no clicks yet still sees which posts are getting seen. */
function tallyLanded(
  days: Array<{ date: string; top_pages: PageRow[] | null }>,
  known: Map<string, { title: string | null; publishedAt: string | null }>,
  from: string | null,
  to: string,
): LandedPage[] {
  const acc = new Map<string, { clicks: number; impressions: number; posW: number; urls: Map<string, number> }>();
  for (const d of days) {
    const date = d.date.slice(0, 10);
    if (date > to || (from != null && date < from)) continue;
    for (const p of d.top_pages ?? []) {
      const key = pagePath(p.page);
      if (!isPost(key, known)) continue;
      const a = acc.get(key) ?? { clicks: 0, impressions: 0, posW: 0, urls: new Map() };
      const impr = p.impressions ?? 0;
      a.clicks += p.clicks ?? 0;
      a.impressions += impr;
      a.posW += (p.position ?? 0) * impr;
      a.urls.set(p.page, (a.urls.get(p.page) ?? 0) + impr);
      acc.set(key, a);
    }
  }
  return [...acc.entries()]
    .filter(([, a]) => a.clicks > 0 || a.impressions > 0)
    .map(([path, a]) => ({
      path,
      url: [...a.urls.entries()].sort((x, y) => y[1] - x[1])[0][0],
      title: known.get(path)?.title ?? null,
      publishedAt: known.get(path)?.publishedAt ?? null,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.impressions > 0 ? Math.round((a.posW / a.impressions) * 10) / 10 : null,
    }))
    .sort((x, y) => y.clicks - x.clicks || y.impressions - x.impressions)
    .slice(0, LANDED_CAP);
}

/** A date `n` days before an ISO day, as yyyy-mm-dd. */
function daysBefore(iso: string, n: number): string {
  return new Date(Date.parse(iso + "T00:00:00Z") - n * 86_400_000).toISOString().slice(0, 10);
}

// About three years of days: the "All time" range never needs more.
const MAX_DAYS = 1100;

export function loadOverviewData(project: Project): Promise<OverviewData> {
  return unstable_cache(
    async (): Promise<OverviewData> => {
      const [dailyRes, pagesRes, landedRes] = await Promise.all([
        // Newest first with a limit, then re-sorted: ascending + limit would
        // pin the window to the oldest days ever collected.
        db().from("gsc_stats").select("date, clicks, impressions").eq("project_id", project.id).order("date", { ascending: false }).limit(MAX_DAYS),
        db().from("pages").select("id, url, title, type, primary_keyword, published_at, created_at, indexed_at").eq("project_id", project.id),
        // The per-page rows (up to 100 a day, ~10 KB) for the "Where they
        // landed" lists. Heavy, which is why they're folded here, once per
        // cache window, into five short lists rather than sent to the page.
        db().from("gsc_stats").select("date, top_pages").eq("project_id", project.id).order("date", { ascending: false }).limit(MAX_DAYS),
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

      // Every page we built (articles and free tools), by pathname, with
      // its title and publish date. (The hosted Home overlays its
      // articles' own titles on top.)
      const known = new Map<string, { title: string | null; publishedAt: string | null }>();
      for (const p of pages as Array<{ url: string; title: string | null; published_at: string | null }>)
        if (p.url && pagePath(p.url) !== "/") known.set(pagePath(p.url), { title: p.title, publishedAt: p.published_at });
      // Every range ends on the newest day Google reported, like the chart
      // (its numbers run two to three days behind). A failed page read
      // leaves the lists empty rather than taking the card down.
      const landed: Landed = {};
      const pageDays = landedRes.error ? [] : ((landedRes.data ?? []) as Array<{ date: string; top_pages: PageRow[] | null }>);
      const to = daily.length ? daily[daily.length - 1].date.slice(0, 10) : null;
      if (to && pageDays.length) {
        for (const key of Object.keys(LANDED_RANGE_DAYS) as LandedRangeKey[]) {
          const n = LANDED_RANGE_DAYS[key];
          landed[key] = tallyLanded(pageDays, known, n == null ? null : daysBefore(to, n - 1), to);
        }
      }
      return { journey, daily, landed };
    },
    ["hosted-overview-v3", project.id],
    { revalidate: 600, tags: [gscTag(project.id)] },
  )();
}
