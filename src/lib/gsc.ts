import { google } from "googleapis";

// Google Search Console (Search Analytics) client. Reads clicks/impressions
// per project: ONE service account (env) serves every project - its email just
// has to be added as a user on each project's GSC property. The property to
// query is a parameter (projects.gsc_site_url), never an env constant.
//
// GSC data lags 2-3 days, so "yesterday" is often empty. We find the most recent
// date that actually has data and snapshot THAT, storing it under its own date -
// never blindly writing an empty "yesterday" row.

function searchConsole() {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GSC_SERVICE_ACCOUNT_JSON");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return google.searchconsole({ version: "v1", auth });
}

// The service account's email - onboarding shows this so the user can add it
// to their GSC property. Null when the credential env var isn't set.
export function serviceAccountEmail(): string | null {
  try {
    const raw = process.env.GSC_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { client_email?: string };
    return parsed.client_email ?? null;
  } catch {
    return null;
  }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Whether the service account can read the property YET - distinguishes
// "owner hasn't added the service-account user" (403) from "added, but the
// first sync hasn't landed" so the Home setup card can say "waiting" instead
// of re-explaining a step the owner already did. Any successful query counts,
// even one returning zero rows.
export async function gscAccessOk(site: string): Promise<boolean> {
  try {
    await searchConsole().searchanalytics.query({
      siteUrl: site,
      requestBody: { startDate: "2020-01-01", endDate: "2020-01-02", rowLimit: 1 },
    });
    return true;
  } catch {
    return false;
  }
}

export type GscSnapshot = {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
  top_pages: Array<{ page: string; clicks: number; impressions: number; position: number }>;
};

export type Fresh24h = {
  clicks: number;
  impressions: number;
  prevClicks: number;
  prevImpressions: number;
};

// Live "last 24 hours" totals from GSC's fresh hourly data (dataState
// HOURLY_ALL), plus the 24 hours before for the trend arrow. Fresh numbers
// are provisional - Google revises them as hours finalize. Throws on API
// errors; callers decide the fallback.
export async function getFresh24h(site: string): Promise<Fresh24h> {
  const sc = searchConsole();
  const now = Date.now();

  // Dates are PT days and both bounds are inclusive; 3 days back covers the
  // two 24h windows through any UTC/PT skew. Hour keys carry their own offset
  // ("2026-07-13T06:00:00-07:00"), so the window filter below is exact.
  const res = await sc.searchanalytics.query({
    siteUrl: site,
    requestBody: {
      startDate: ymd(new Date(now - 3 * 86400000)),
      endDate: ymd(new Date(now)),
      dataState: "HOURLY_ALL",
      dimensions: ["HOUR"],
    },
  });

  const out = { clicks: 0, impressions: 0, prevClicks: 0, prevImpressions: 0 };
  for (const r of res.data.rows ?? []) {
    const key = r.keys?.[0];
    if (!key) continue;
    const t = new Date(key).getTime();
    if (t >= now - 86400000) {
      out.clicks += r.clicks ?? 0;
      out.impressions += r.impressions ?? 0;
    } else if (t >= now - 2 * 86400000) {
      out.prevClicks += r.clicks ?? 0;
      out.prevImpressions += r.impressions ?? 0;
    }
  }
  return out;
}

// Full snapshot (totals + top 100 queries/pages) for one date. dataState "ALL"
// includes Google's fresh provisional numbers; omitted = finalized data only.
// 100 rows/day keeps the per-page fold lossless well past the current catalog
// size; a page outside a day's top 100 still won't appear for that day.
async function snapshotDay(
  sc: ReturnType<typeof searchConsole>,
  site: string,
  date: string,
  dataState?: "ALL",
): Promise<GscSnapshot> {
  const base = { startDate: date, endDate: date, ...(dataState ? { dataState } : {}) };
  const [totalsRes, queriesRes, pagesRes] = await Promise.all([
    sc.searchanalytics.query({ siteUrl: site, requestBody: { ...base } }),
    sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { ...base, dimensions: ["query"], rowLimit: 100 },
    }),
    sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { ...base, dimensions: ["page"], rowLimit: 100 },
    }),
  ]);
  const t = totalsRes.data.rows?.[0];

  return {
    date,
    clicks: t?.clicks ?? 0,
    impressions: t?.impressions ?? 0,
    ctr: t?.ctr ?? 0,
    avg_position: t?.position ?? 0,
    top_queries: (queriesRes.data.rows ?? []).map((r) => ({
      query: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    })),
    top_pages: (pagesRes.data.rows ?? []).map((r) => ({
      page: r.keys?.[0] ?? "",
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      position: r.position ?? 0,
    })),
  };
}

// Dates (yyyy-mm-dd) in the last `windowDays` that have rows, ascending.
async function datesWithData(
  sc: ReturnType<typeof searchConsole>,
  site: string,
  windowDays: number,
  dataState?: "ALL",
): Promise<string[]> {
  const today = new Date();
  const start = new Date(today.getTime() - windowDays * 86400000);
  const byDate = await sc.searchanalytics.query({
    siteUrl: site,
    requestBody: {
      startDate: ymd(start),
      endDate: ymd(today),
      ...(dataState ? { dataState } : {}),
      dimensions: ["date"],
      rowLimit: 20,
    },
  });
  return (byDate.data.rows ?? [])
    .map((r) => r.keys?.[0] ?? "")
    .filter(Boolean)
    .sort();
}

// Returns a finalized-data snapshot for the most recent date with data, or
// null if the window has no data at all. Used by the daily cron - the slow,
// authoritative path.
export async function getLatestSnapshot(site: string): Promise<GscSnapshot | null> {
  const sc = searchConsole();
  const latest = (await datesWithData(sc, site, 10)).pop();
  if (!latest) return null;
  return snapshotDay(sc, site, latest);
}

// GSC-mode rank tracking (keyword_source 'gsc'): the average position of each
// tracked keyword over the last `windowDays`, from real-user impressions. This
// is the free substitute for a live SERP check - honest caveats: it's an
// impression-weighted average (not a snapshot), lags 2-3 days, and a keyword
// with zero impressions in the window simply has no entry (unknown, NOT "not
// ranking"). Matching is exact on the lowercased query string.
export async function gscQueryPositions(
  site: string,
  keywords: string[],
  windowDays = 7,
): Promise<Map<string, { position: number; clicks: number; impressions: number }>> {
  const sc = searchConsole();
  const today = new Date();
  const start = new Date(today.getTime() - windowDays * 86400000);
  const res = await sc.searchanalytics.query({
    siteUrl: site,
    requestBody: {
      startDate: ymd(start),
      endDate: ymd(today),
      dimensions: ["query"],
      rowLimit: 25000,
    },
  });
  const byQuery = new Map<string, { position: number; clicks: number; impressions: number }>();
  for (const r of res.data.rows ?? []) {
    const q = (r.keys?.[0] ?? "").toLowerCase();
    if (q) {
      byQuery.set(q, {
        position: r.position ?? 0,
        clicks: r.clicks ?? 0,
        impressions: r.impressions ?? 0,
      });
    }
  }
  const out = new Map<string, { position: number; clicks: number; impressions: number }>();
  for (const kw of keywords) {
    const hit = byQuery.get(kw.trim().toLowerCase());
    if (hit && hit.position > 0) out.set(kw, hit);
  }
  return out;
}

// Read-only URL Inspection: what Google actually says about one page. A PASS
// verdict means the page is indexed. Quota is 2000 calls per property per day
// - callers keep a small per-run budget, they never sweep the whole catalog.
export type IndexInspection = {
  verdict: string | null; // PASS | FAIL | NEUTRAL | VERDICT_UNSPECIFIED
  coverage_state: string | null; // e.g. "Submitted and indexed"
};

export async function inspectIndexStatus(
  site: string,
  pageUrl: string,
): Promise<IndexInspection> {
  const sc = searchConsole();
  const res = await sc.urlInspection.index.inspect({
    requestBody: { siteUrl: site, inspectionUrl: pageUrl },
  });
  const r = res.data.inspectionResult?.indexStatusResult;
  return { verdict: r?.verdict ?? null, coverage_state: r?.coverageState ?? null };
}

// Snapshots for the most recent `days` dates with data, INCLUDING Google's
// fresh provisional numbers (dataState ALL) - so today's partial day exists at
// all. Used by the hourly cron: re-upserting the same trailing dates every
// hour both moves today's numbers intraday and converges each row to its
// final values once Google finalizes it (fresh numbers can be revised in
// either direction until then).
export async function getFreshSnapshots(site: string, days = 3): Promise<GscSnapshot[]> {
  const sc = searchConsole();
  const dates = (await datesWithData(sc, site, 7, "ALL")).slice(-days);
  return Promise.all(dates.map((d) => snapshotDay(sc, site, d, "ALL")));
}
