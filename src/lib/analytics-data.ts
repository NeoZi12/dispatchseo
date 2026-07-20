import { db } from "./db";
import { credsForProject } from "./dataforseo";
import { getDomainRating, type DomainRating } from "./domain-rating";
import { getFresh24h, type Fresh24h } from "./gsc";
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
  current: number | null; // null = outside top 100
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

export async function getAnalyticsOverview(project: Project): Promise<AnalyticsOverview> {
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
      .order("checked_at", { ascending: true }),
    credsForProject(project).then((creds) => getDomainRating(project.id, project.domain, creds)),
    // Fresh data is a nice-to-have; a GSC hiccup must not take down the page.
    // No GSC property connected yet -> no fresh numbers, by definition.
    project.gsc_site_url
      ? getFresh24h(project.gsc_site_url).catch(() => null)
      : Promise.resolve(null),
  ]);

  const pages = (pagesRes.data ?? []) as AnalyticsPage[];
  const gsc = ((gscRes.data ?? []) as GscFullRow[]).reverse();
  const gscDaily = (gscDailyRes.data ?? []) as GscRow[];
  const keywords = (kwRes.data ?? []) as Keyword[];
  const checks = (checksRes.data ?? []) as RankCheck[];

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
      return { keyword: k, current: d.current, change: d.d30, volume: k.search_volume };
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
