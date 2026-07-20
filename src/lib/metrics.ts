// Shared data shapes and math for the dashboard screens.
// The deltas/grouping logic here is moved verbatim from the old single page -
// do not change the math without checking every screen that renders it.

export type Suggestion = {
  id: string;
  type: string;
  title: string;
  primary_keyword: string | null;
  keyword_volume: number | null;
  keyword_difficulty: number | null;
  rationale: string | null;
  status: string;
  result_pr_url: string | null;
  created_at: string;
  decided_at?: string | null;
  completed_at?: string | null;
  // 'research' | 'trend-scan' | 'manual' - absent until migration 0013 runs.
  source?: string | null;
  // Owner-set build order - absent until migration 0014 runs. See sortQueue.
  queue_position?: number | null;
  // Free-form brief from the proposer; trend-scan ideas carry their hype
  // evidence here (why_now, signals, angle, serp_notes).
  spec?: Record<string, unknown> | null;
  // The radar subject a trend take was expanded from - groups takes under
  // their topic card on the Trends page. Absent until migration 0016 runs;
  // pre-topic trend ideas keep null and render in the legacy block.
  trend_topic_id?: string | null;
};

// A radar subject from the two-stage trend radar (stage 1 output). The scan
// proposes these; the owner picks one (Get takes -> 'expanding') and its
// takes land as Suggestions linked back via trend_topic_id ('expanded').
export type TrendTopic = {
  id: string;
  title: string;
  // seed_url/seed_stats: the single most viral piece of content driving the
  // subject (video/thread) plus its public numbers - the builder writes FROM
  // that source when a take carries it forward in its spec.
  evidence: {
    why_now?: string;
    signals?: string[];
    sources?: string[];
    seed_url?: string;
    seed_stats?: string;
  } | null;
  status: "new" | "expanding" | "expanded" | "dismissed";
  expand_requested_at: string | null;
  expanded_at: string | null;
  created_at: string;
};

// Build-order sort for the suggestions queue: owner-set queue_position first
// (lowest builds next), then FIFO by created_at for unpositioned rows. Done
// in JS on purpose - ordering by the column in SQL would break every consumer
// that runs before migration 0014 adds it.
export function sortQueue<
  T extends { created_at: string; queue_position?: number | null },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.queue_position ?? null;
    const pb = b.queue_position ?? null;
    if (pa != null && pb != null && pa !== pb) return pa - pb;
    if (pa != null && pb == null) return -1;
    if (pa == null && pb != null) return 1;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

export type Keyword = {
  id: string;
  keyword: string;
  search_volume: number | null;
  keyword_difficulty: number | null;
};

export type RankCheck = {
  keyword_id: string;
  position: number | null;
  checked_at: string;
};

export type GscRow = {
  date: string;
  clicks: number | null;
  impressions: number | null;
};

export type PublishedPage = {
  id: string;
  url: string;
  title: string | null;
  primary_keyword: string | null;
  created_at: string;
};

export type Prospect = {
  id: string;
  domain: string;
  reason: string | null;
  status: string;
};

export function sumGsc(
  rows: Array<Pick<GscRow, "clicks" | "impressions">>,
  k: "clicks" | "impressions",
) {
  return rows.reduce((a, r) => a + (r[k] ?? 0), 0);
}

// Second half of the window vs the first half - a rough "is it moving" trend.
export function halfDelta(rows: GscRow[], k: "clicks" | "impressions") {
  if (rows.length < 2) return null;
  const half = Math.floor(rows.length / 2);
  return sumGsc(rows.slice(half), k) - sumGsc(rows.slice(0, half), k);
}

// ---------- per-page / per-query traffic (analytics screen) ----------
// GSC stores only the top ~100 pages and queries per day (top 20 in rows
// snapshotted before the limit was raised), inside each gsc_stats row's jsonb.
// To get per-guide/per-tool traffic over a window we fold those daily arrays
// together. Long-tail pages that never make a day's cutoff won't appear here -
// that's a GSC-snapshot limitation, not a bug.

export type GscPageStat = {
  page: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
};

export type GscQueryStat = {
  query: string;
  clicks: number | null;
  impressions: number | null;
  position: number | null;
};

// Full gsc_stats row including the jsonb breakdowns the analytics page needs.
export type GscFullRow = {
  date: string;
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  avg_position: number | null;
  top_queries: GscQueryStat[] | null;
  top_pages: GscPageStat[] | null;
};

export type PageTraffic = {
  clicks: number;
  impressions: number;
  avgPosition: number | null; // impression-weighted
};

export function normalizePageUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

// Fold every day's top_pages into one clicks/impressions/position roll-up per
// URL. Position is impression-weighted so a page that ranked #3 on a high-traffic
// day dominates a #40 blip.
export function aggregatePageTraffic(
  rows: Array<{ top_pages: GscPageStat[] | null }>,
): Map<string, PageTraffic> {
  const acc = new Map<string, { clicks: number; impressions: number; posWeight: number }>();
  for (const row of rows) {
    for (const p of row.top_pages ?? []) {
      const key = normalizePageUrl(p.page);
      const a = acc.get(key) ?? { clicks: 0, impressions: 0, posWeight: 0 };
      const impr = p.impressions ?? 0;
      a.clicks += p.clicks ?? 0;
      a.impressions += impr;
      a.posWeight += (p.position ?? 0) * impr;
      acc.set(key, a);
    }
  }
  const out = new Map<string, PageTraffic>();
  for (const [k, a] of acc) {
    out.set(k, {
      clicks: a.clicks,
      impressions: a.impressions,
      avgPosition: a.impressions > 0 ? a.posWeight / a.impressions : null,
    });
  }
  return out;
}

// ---------- whole-site traffic breakdown (Traffic by page) ----------
// Buckets every URL Google sent traffic to - built pages AND everything else
// (homepage, hand-written posts, /free pages) - so the table reconciles to the
// site total instead of silently dropping unregistered pages. Grouping is by
// pathname, which folds www/non-www and trailing-slash variants of the same
// page into one row.

export type PageBucket = "guide" | "tool" | "homepage" | "other";

export type SitePageRow = {
  path: string; // "/" for the homepage
  url: string; // representative full URL (the variant with the most impressions)
  bucket: PageBucket;
  title: string | null; // from the pages table when the page is registered
  clicks: number;
  impressions: number;
  avgPosition: number | null; // impression-weighted
};

export type TrafficBreakdown = {
  rows: SitePageRow[]; // clicks desc, then impressions desc
  buckets: Record<PageBucket, { clicks: number; impressions: number; pages: number }>;
  total: { clicks: number; impressions: number }; // site totals for the window
  // total minus the per-page fold: long-tail pages below each day's stored
  // cutoff. Never negative.
  unattributed: { clicks: number; impressions: number };
};

export function pagePath(url: string): string {
  try {
    const p = new URL(url.trim()).pathname.replace(/\/+$/, "").toLowerCase();
    return p === "" ? "/" : p;
  } catch {
    return normalizePageUrl(url);
  }
}

export function buildTrafficBreakdown(
  gsc: Array<{ clicks: number | null; impressions: number | null; top_pages: GscPageStat[] | null }>,
  registered: Array<{ url: string; type: string | null; title: string | null }>,
): TrafficBreakdown {
  // Registered pages by pathname; landing pages group with tools, matching the
  // guides/tools split used everywhere else.
  const byPath = new Map<string, { bucket: PageBucket; title: string | null }>();
  for (const p of registered) {
    byPath.set(pagePath(p.url), {
      bucket: p.type === "guide" ? "guide" : "tool",
      title: p.title,
    });
  }

  const acc = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      posWeight: number;
      urls: Map<string, number>; // variant url -> impressions, to pick a representative
    }
  >();
  for (const row of gsc) {
    for (const p of row.top_pages ?? []) {
      const key = pagePath(p.page);
      const a = acc.get(key) ?? { clicks: 0, impressions: 0, posWeight: 0, urls: new Map() };
      const impr = p.impressions ?? 0;
      a.clicks += p.clicks ?? 0;
      a.impressions += impr;
      a.posWeight += (p.position ?? 0) * impr;
      a.urls.set(p.page, (a.urls.get(p.page) ?? 0) + impr);
      acc.set(key, a);
    }
  }

  const rows: SitePageRow[] = [...acc.entries()]
    .map(([path, a]) => {
      const reg = byPath.get(path);
      const bucket: PageBucket = reg ? reg.bucket : path === "/" ? "homepage" : "other";
      const url = [...a.urls.entries()].sort((x, y) => y[1] - x[1])[0][0];
      return {
        path,
        url,
        bucket,
        title: reg?.title ?? null,
        clicks: a.clicks,
        impressions: a.impressions,
        avgPosition: a.impressions > 0 ? a.posWeight / a.impressions : null,
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);

  const buckets: TrafficBreakdown["buckets"] = {
    guide: { clicks: 0, impressions: 0, pages: 0 },
    tool: { clicks: 0, impressions: 0, pages: 0 },
    homepage: { clicks: 0, impressions: 0, pages: 0 },
    other: { clicks: 0, impressions: 0, pages: 0 },
  };
  for (const r of rows) {
    const b = buckets[r.bucket];
    b.clicks += r.clicks;
    b.impressions += r.impressions;
    b.pages += 1;
  }

  const total = {
    clicks: sumGsc(gsc, "clicks"),
    impressions: sumGsc(gsc, "impressions"),
  };
  const foldClicks = rows.reduce((a, r) => a + r.clicks, 0);
  const foldImpressions = rows.reduce((a, r) => a + r.impressions, 0);

  return {
    rows,
    buckets,
    total,
    unattributed: {
      clicks: Math.max(0, total.clicks - foldClicks),
      impressions: Math.max(0, total.impressions - foldImpressions),
    },
  };
}

// Same fold for search queries, returned newest-strongest first by impressions.
export function aggregateQueries(
  rows: Array<{ top_queries: GscQueryStat[] | null }>,
  limit = 15,
): Array<{ query: string; clicks: number; impressions: number; position: number | null }> {
  const acc = new Map<string, { clicks: number; impressions: number; posWeight: number }>();
  for (const row of rows) {
    for (const q of row.top_queries ?? []) {
      const a = acc.get(q.query) ?? { clicks: 0, impressions: 0, posWeight: 0 };
      const impr = q.impressions ?? 0;
      a.clicks += q.clicks ?? 0;
      a.impressions += impr;
      a.posWeight += (q.position ?? 0) * impr;
      acc.set(q.query, a);
    }
  }
  return [...acc.entries()]
    .map(([query, a]) => ({
      query,
      clicks: a.clicks,
      impressions: a.impressions,
      position: a.impressions > 0 ? a.posWeight / a.impressions : null,
    }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks)
    .slice(0, limit);
}

export function groupChecks(checks: RankCheck[]) {
  const byKw = new Map<string, RankCheck[]>();
  for (const c of checks) {
    const arr = byKw.get(c.keyword_id) ?? [];
    arr.push(c);
    byKw.set(c.keyword_id, arr);
  }
  return byKw;
}

// Position deltas: positive = moved up (a lower position number is better).
export function deltas(series: RankCheck[]) {
  const current = series.length ? series[series.length - 1].position : null;
  const at = (days: number) => {
    const cutoff = Date.now() - days * 86400000;
    const past = series.filter((c) => new Date(c.checked_at).getTime() <= cutoff);
    return past.length ? past[past.length - 1].position : null;
  };
  const d7 = at(7);
  const d30 = at(30);
  return {
    current,
    d7: current != null && d7 != null ? d7 - current : null,
    d30: current != null && d30 != null ? d30 - current : null,
  };
}
