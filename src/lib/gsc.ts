import { google } from "googleapis";
import { instanceSettings } from "./dashboard-auth";
import { decryptSecret } from "./crypto";

// Google Search Console (Search Analytics) client. Reads clicks/impressions
// per project: ONE service account serves every project - its email just
// has to be added as a user on each project's GSC property. The property to
// query is a parameter (projects.gsc_site_url), never an env constant.
//
// Credential resolution: the GSC_SERVICE_ACCOUNT_JSON env var wins when set
// (classic installs, Vercel deployments); otherwise the encrypted copy the
// onboarding wizard stores in instance_settings (0029) - that's how a
// self-hoster connects Search Console without touching .env. Cached per
// process; the connect action busts it.
//
// GSC data lags 2-3 days, so "yesterday" is often empty. We find the most recent
// date that actually has data and snapshot THAT, storing it under its own date -
// never blindly writing an empty "yesterday" row.

let credCache: { raw: string | null } | null = null;

export function bustGscCredCache() {
  credCache = null;
}

async function credentialJson(): Promise<string | null> {
  if (credCache) return credCache.raw;
  let raw: string | null = process.env.GSC_SERVICE_ACCOUNT_JSON ?? null;
  if (!raw) {
    try {
      const settings = await instanceSettings();
      const stored = settings?.gsc_service_account_json;
      raw = stored ? await decryptSecret(stored) : null;
    } catch {
      raw = null;
    }
  }
  credCache = { raw };
  return raw;
}

async function searchConsole() {
  const raw = await credentialJson();
  if (!raw) throw new Error("Missing GSC service account (connect it in the wizard or set GSC_SERVICE_ACCOUNT_JSON)");
  const credentials = JSON.parse(raw);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  // timeout bounds a hung GSC call (same posture as dataforseo.ts's 25s) so a
  // single slow request can't silently eat a cron's whole function budget.
  return google.searchconsole({ version: "v1", auth, timeout: 25000 });
}

// The service account's email - onboarding shows this so the user can add it
// to their GSC property. Null when no credential is connected anywhere.
export async function serviceAccountEmail(): Promise<string | null> {
  try {
    const raw = await credentialJson();
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

// Whether the service account can read the property YET, and if not, WHY -
// the distinction the crons gate on. "pending" means the owner simply hasn't
// finished setup (service account not added to the property, or no
// service-account env on an OAuth-only install): an expected mid-setup state
// that automations must skip quietly, never alarm on. "error" is everything
// else - broken creds, network, Google 5xx - a real failure the caller may
// surface loudly. Any successful query counts as ok, even one returning zero
// rows.
export type GscAccessProbe =
  | { state: "ok" }
  | { state: "pending"; why: string }
  | { state: "error"; why: string };

export async function gscAccessProbe(site: string): Promise<GscAccessProbe> {
  let sc: Awaited<ReturnType<typeof searchConsole>>;
  try {
    sc = await searchConsole();
  } catch {
    return { state: "pending", why: "no GSC service account configured on this deployment" };
  }
  try {
    await sc.searchanalytics.query({
      siteUrl: site,
      requestBody: { startDate: "2020-01-01", endDate: "2020-01-02", rowLimit: 1 },
    });
    return { state: "ok" };
  } catch (e) {
    const err = e as { code?: number | string; response?: { status?: number }; message?: string };
    const status = Number(err.code ?? err.response?.status ?? 0);
    const msg = err.message ?? String(e);
    // 403 = the service account isn't a user on the property (or the property
    // string is a wrong onboarding guess - Google answers 403 for those too).
    // Either way it's the owner's pending setup step, not an outage.
    if (status === 403 || status === 404 || /permission|forbidden/i.test(msg)) {
      return { state: "pending", why: `Search Console access not granted for ${site}` };
    }
    return { state: "error", why: msg };
  }
}

// Boolean view for the Home setup card: "owner already added the service
// account" flips the card to "waiting on the first sync".
export async function gscAccessOk(site: string): Promise<boolean> {
  return (await gscAccessProbe(site)).state === "ok";
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
  const sc = await searchConsole();
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
  sc: Awaited<ReturnType<typeof searchConsole>>,
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
  sc: Awaited<ReturnType<typeof searchConsole>>,
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
  const sc = await searchConsole();
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
  const sc = await searchConsole();
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
  const sc = await searchConsole();
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
  const sc = await searchConsole();
  const dates = (await datesWithData(sc, site, 7, "ALL")).slice(-days);
  return Promise.all(dates.map((d) => snapshotDay(sc, site, d, "ALL")));
}
