import { db } from "./db";
import { credsForProject } from "./dataforseo";
import { getDomainRating, type DomainRating } from "./domain-rating";
import { getFresh24h, gscClientForProject, type Fresh24h } from "./gsc";
import type { Project } from "./projects";
import {
  aggregatePageTraffic,
  aggregateQueries,
  buildTrafficBreakdown,
  deltas,
  groupChecks,
  sumGsc,
  normalizePageUrl,
  type GscFullRow,
  type GscRow,
  type Keyword,
  type PageTraffic,
  type RankCheck,
  type TrafficBreakdown,
} from "./metrics";

// Single source of truth for the analytics numbers, shared by the Analytics
// page and the Home summary so the two can never drift. Does the db() reads +
// domain rating in one Promise.all, folds the GSC snapshots into per-page and
// per-query roll-ups, and derives the keyword ranking table.

export type AnalyticsPage = {
  id: string;
  url: string;
  title: string | null;
  type: string | null; // guide | tool | landing
  primary_keyword: string | null;
  published_at: string | null;
  // Set by the indexing verifier (migration 0010); null = not seen indexed yet.
  indexed_at: string | null;
  created_at: string;
};

export type PageRow = AnalyticsPage & PageTraffic;

export type RankingRow = {
  keyword: Keyword;
  current: number | null; // null = outside top 100 (only meaningful when checked=true)
  checked: boolean; // false = no rank_checks row exists yet - not the same as "outside top 100"
  lastCheckedAt: string | null;
  change: number | null; // 30d, positive = improved toward #1
  volume: number | null;
};

export type AnalyticsOverview = {
  domain: string;
  dr: DomainRating | null;
  gsc: GscFullRow[];
  gscDaily: GscRow[]; // full history (date/clicks/impressions), ascending
  fresh24: Fresh24h | null; // live fresh hourly totals; null if the call failed
  totals: {
    clicks: number;
    impressions: number;
    ctr: number | null;
    avgPosition: number | null;
  };
  guides: PageRow[];
  tools: PageRow[]; // tool + landing pages
  // Whole-site per-page traffic - built pages AND unregistered ones (homepage,
  // hand-written posts), bucketed so the table reconciles to the site total.
  breakdown: TrafficBreakdown;
  rankings: RankingRow[];
  rankingCount: number; // how many tracked keywords are in the top 100
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number | null }>;
};

function attachTraffic(
  pages: AnalyticsPage[],
  traffic: Map<string, PageTraffic>,
): PageRow[] {
  return pages
    .map((p) => {
      const t = traffic.get(normalizePageUrl(p.url)) ?? {
        clicks: 0,
        impressions: 0,
        avgPosition: null,
      };
      return { ...p, ...t };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

export type AnalyticsOverviewOpts = {
  /** Skip the live Search Console 24h call (a network round trip per render). */
  fresh24?: boolean;
  /** Skip the domain-rating read (a DataForSEO-backed lookup when stale). */
  dr?: boolean;
};

export async function getAnalyticsOverview(project: Project, opts: AnalyticsOverviewOpts = {}): Promise<AnalyticsOverview> {
  const client = db();
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();

  const [pagesRes, gscRes, gscDailyRes, kwRes, checksRes, dr, fresh24] = await Promise.all([
    client
      .from("pages")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    // Newest 28 rows, then re-sorted ascending below. Ordering ascending with a
    // limit would pin the window to the oldest 28 days ever collected.
    client
      .from("gsc_stats")
      .select("date, clicks, impressions, ctr, avg_position, top_queries, top_pages")
      .eq("project_id", project.id)
      .order("date", { ascending: false })
      .limit(28),
    // Full daily history, light columns only - one row per day, so this stays
    // small for years. Feeds the range selector on the Home stat tiles.
    client
      .from("gsc_stats")
      .select("date, clicks, impressions")
      .eq("project_id", project.id)
      .order("date", { ascending: true }),
    client
      .from("keywords")
      .select("id, keyword, search_volume, keyword_difficulty")
      .eq("project_id", project.id),
    client
      .from("rank_checks")
      .select("keyword_id, position, checked_at")
      .eq("project_id", project.id)
      .gte("checked_at", since30)
      // NEWEST-first with an explicit cap, the pattern dataforseo-tasks.ts and
      // ai-visibility.ts already use, and for the reason spelled out there: a
      // read past PostgREST's row cap is TRUNCATED SILENTLY. Ascending order
      // meant truncation dropped the newest rows - the only ones every derived
      // number depends on - so a site tracking a few hundred keywords would
      // quietly start showing month-old positions as "current", with no error
      // anywhere. 30 days x 365 keywords is already ~11k rows.
      // deltas() reads series[length-1] as the CURRENT position, so the array
      // it finally sees must still be ascending - re-sorted in JS below. Fetch
      // order decides only WHICH rows survive truncation; sort order decides
      // what the numbers mean. Getting that backwards would make every
      // "current rank" a month old, always, instead of occasionally.
      .order("checked_at", { ascending: false })
      .range(0, 19999),
    opts.dr === false
      ? Promise.resolve(null)
      : credsForProject(project).then((creds) => getDomainRating(project.id, project.domain, creds)),
    // Fresh data is a nice-to-have; a GSC hiccup must not take down the page.
    // No GSC property connected yet -> no fresh numbers, by definition.
    project.gsc_site_url && opts.fresh24 !== false
      ? gscClientForProject(project)
          .then((sc) => getFresh24h(project.gsc_site_url!, sc))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const pages = (pagesRes.data ?? []) as AnalyticsPage[];
  const gsc = ((gscRes.data ?? []) as GscFullRow[]).reverse();
  const gscDaily = (gscDailyRes.data ?? []) as GscRow[];
  const keywords = (kwRes.data ?? []) as Keyword[];
  // Fetched newest-first so truncation loses the OLDEST rows; restored to
  // ascending here because deltas() defines "current" as the last element.
  const checks = ((checksRes.data ?? []) as RankCheck[])
    .slice()
    .sort((a, b) => a.checked_at.localeCompare(b.checked_at));

  const clicks = sumGsc(gsc, "clicks");
  const impressions = sumGsc(gsc, "impressions");
  let posW = 0;
  let posI = 0;
  for (const r of gsc) {
    const impr = r.impressions ?? 0;
    if (r.avg_position != null && impr > 0) {
      posW += r.avg_position * impr;
      posI += impr;
    }
  }

  const traffic = aggregatePageTraffic(gsc);
  const guides = attachTraffic(pages.filter((p) => p.type === "guide"), traffic);
  const tools = attachTraffic(pages.filter((p) => p.type !== "guide"), traffic);

  const byKw = groupChecks(checks);
  const rankings: RankingRow[] = keywords
    .map((k) => {
      const d = deltas(byKw.get(k.id) ?? []);
      return {
        keyword: k,
        current: d.current,
        checked: d.checked,
        lastCheckedAt: d.lastCheckedAt,
        change: d.d30,
        volume: k.search_volume,
      };
    })
    .sort((a, b) => {
      if (a.current == null && b.current == null) return 0;
      if (a.current == null) return 1;
      if (b.current == null) return -1;
      return a.current - b.current;
    });

  return {
    domain: project.domain,
    dr,
    gsc,
    gscDaily,
    fresh24,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : null,
      avgPosition: posI > 0 ? posW / posI : null,
    },
    guides,
    tools,
    breakdown: buildTrafficBreakdown(gsc, pages),
    rankings,
    rankingCount: rankings.filter((r) => r.current != null).length,
    topQueries: aggregateQueries(gsc, 15),
  };
}
