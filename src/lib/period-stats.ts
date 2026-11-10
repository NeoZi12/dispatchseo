import { db } from "@/lib/db";
import { after } from "next/server";
import { gscClientForProject } from "@/lib/gsc";
import { HOURLY_KEEP_DAYS, readHourly, syncHourly, type StoredDay } from "@/lib/gsc-hourly";
import type { Project } from "@/lib/projects";
import { pagePath, type GscPageStat, type GscQueryStat } from "@/lib/metrics";

// One stretch of days on Google, for the overview chart's drill-down (click
// a day, a week or a month on Home) and the get_period_stats MCP tool: the
// totals, the same stretch just before it for comparison, every day inside
// it, the pages people landed on and the searches that brought them, and
// what went live in it. All of it is already stored on gsc_stats (the daily
// snapshot keeps Google's top 100 pages and top 20 searches per day) -
// nothing here calls Google or DataForSEO.
//
// "Pages" and "searches" are the stored top lists summed over the stretch,
// so on a big site a long-tail page below a day's cutoff is missing from
// its list; `unattributed` says how many clicks that leaves out.

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
/** The longest stretch one read serves (a bit over two years of months). */
export const MAX_PERIOD_DAYS = 800;

export type PeriodDay = { date: string; clicks: number; impressions: number; reported: boolean };
export type PeriodPage = {
  url: string;
  path: string;
  /** Our article's title when we wrote it, else the pages table's, else null. */
  title: string | null;
  /** The article_drafts id when the page is one of ours, or "page:<pages.id>"
   *  for one the site's coding agent wrote (both open /articles/<draftId>). */
  draftId: string | null;
  keyword: string | null;
  clicks: number;
  impressions: number;
  /** Impression-weighted spot on Google over the stretch. */
  position: number | null;
};
export type PeriodQuery = { query: string; clicks: number; impressions: number; position: number | null };

export type PeriodStats = {
  from: string;
  to: string;
  days: number;
  /** Days in the stretch Google has reported (it runs 2-3 days behind). */
  reportedDays: number;
  clicks: number;
  impressions: number;
  /** Click-through rate, 0-1; null with no impressions. */
  ctr: number | null;
  position: number | null;
  /** The same number of days just before; null when fewer than half of
   *  them were reported (a young site doesn't get a fake "up 900%"). */
  previous: { from: string; to: string; clicks: number; impressions: number } | null;
  /** A single day only: its rank by clicks among every reported day, and
   *  how many days there are. rank 1 = the best day so far. */
  dayRank: { rank: number; of: number } | null;
  daily: PeriodDay[];
  pages: PeriodPage[];
  queries: PeriodQuery[];
  /** Clicks the per-page lists can't place (below each day's top-100). */
  unattributed: number;
  /** Articles that went live inside the stretch, oldest first. */
  published: Array<{ draftId: string | null; title: string; url: string | null; at: string }>;
};

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const t0 = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Validates and orders a requested stretch. Null = not a usable range. */
export function parsePeriod(from: string | undefined, to: string | undefined): { from: string; to: string } | null {
  const a = from?.trim();
  const b = (to?.trim() || a) ?? "";
  if (!a || !ISO_DAY.test(a) || !ISO_DAY.test(b)) return null;
  const [x, y] = t0(a) <= t0(b) ? [a, b] : [b, a];
  if (!Number.isFinite(t0(x)) || !Number.isFinite(t0(y))) return null;
  if ((t0(y) - t0(x)) / DAY + 1 > MAX_PERIOD_DAYS) return null;
  return { from: x, to: y };
}

/** "page:<id>" is how the report keys an article the site's coding agent
 *  wrote before autopilot, and /articles/page:<id> opens it - but only
 *  guides are in the report (autopilot/report.ts earlierArticles), so a
 *  tool or landing page gets null and links to the live page instead. */
function articleIdOf(p: { id: string; url: string; type: string | null }): string | null {
  return p.type === "guide" || ((p.type == null || p.type === "") && /\/blog\//.test(p.url)) ? `page:${p.id}` : null;
}

type Light = { date: string; clicks: number | null; impressions: number | null };
type Full = Light & { avg_position: number | null; top_pages: GscPageStat[] | null; top_queries: GscQueryStat[] | null };

export async function getPeriodStats(projectId: string, from: string, to: string, opts: { pages?: number; queries?: number } = {}): Promise<PeriodStats> {
  const days = Math.round((t0(to) - t0(from)) / DAY) + 1;
  const prevTo = iso(t0(from) - DAY);
  const prevFrom = iso(t0(from) - days * DAY);
  const single = days === 1;

  const [fullRes, prevRes, allRes, draftsRes, pagesRes] = await Promise.all([
    db()
      .from("gsc_stats")
      .select("date, clicks, impressions, avg_position, top_pages, top_queries")
      .eq("project_id", projectId)
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: true }),
    db().from("gsc_stats").select("date, clicks, impressions").eq("project_id", projectId).gte("date", prevFrom).lte("date", prevTo),
    // Every day's clicks, only for a single day's "best day so far" rank.
    single ? db().from("gsc_stats").select("date, clicks").eq("project_id", projectId).limit(5000) : Promise.resolve({ data: null, error: null }),
    db()
      .from("article_drafts")
      .select("id, title, primary_keyword, published_url, published_at")
      .eq("project_id", projectId)
      .not("published_url", "is", null)
      .not("status", "in", "(discarded,removed)")
      .order("published_at", { ascending: false })
      .limit(1000),
    db().from("pages").select("id, url, title, type, primary_keyword, published_at").eq("project_id", projectId).limit(2000),
  ]);
  if (fullRes.error) throw new Error(`could not read Google stats: ${fullRes.error.message}`);

  const rows = (fullRes.data ?? []) as Full[];
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const daily: PeriodDay[] = [];
  for (let t = t0(from); t <= t0(to); t += DAY) {
    const r = byDate.get(iso(t));
    daily.push({ date: iso(t), clicks: r?.clicks ?? 0, impressions: r?.impressions ?? 0, reported: Boolean(r) });
  }
  const clicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
  const impressions = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
  let posW = 0;
  let posN = 0;
  for (const r of rows) {
    if (r.avg_position == null) continue;
    const w = Math.max(r.impressions ?? 0, 1);
    posW += Number(r.avg_position) * w;
    posN += w;
  }

  const prevRows = (prevRes.data ?? []) as Light[];
  const previous =
    prevRows.length >= days / 2
      ? {
          from: prevFrom,
          to: prevTo,
          clicks: prevRows.reduce((s, r) => s + (r.clicks ?? 0), 0),
          impressions: prevRows.reduce((s, r) => s + (r.impressions ?? 0), 0),
        }
      : null;

  let dayRank: PeriodStats["dayRank"] = null;
  if (single && rows.length && allRes.data) {
    const all = (allRes.data as Array<{ clicks: number | null }>).map((r) => r.clicks ?? 0);
    dayRank = { rank: all.filter((c) => c > clicks).length + 1, of: all.length };
  }

  // Our articles by path (folds www / trailing slash / case), then the
  // pages table for anything the site's coding agent wrote.
  type Ours = { draftId: string | null; title: string | null; keyword: string | null };
  const ours = new Map<string, Ours>();
  const drafts = (draftsRes.data ?? []) as Array<{ id: string; title: string | null; primary_keyword: string | null; published_url: string; published_at: string | null }>;
  for (const d of drafts) {
    const k = pagePath(d.published_url);
    if (!ours.has(k)) ours.set(k, { draftId: d.id, title: d.title, keyword: d.primary_keyword });
  }
  const sitePages = (pagesRes.data ?? []) as Array<{ id: string; url: string; title: string | null; type: string | null; primary_keyword: string | null; published_at: string | null }>;
  for (const p of sitePages) {
    const k = pagePath(p.url);
    if (!ours.has(k)) ours.set(k, { draftId: articleIdOf(p), title: p.title, keyword: p.primary_keyword });
  }

  const pageAcc = new Map<string, { url: string; urlImpr: number; clicks: number; impressions: number; posW: number; posN: number }>();
  const queryAcc = new Map<string, { query: string; clicks: number; impressions: number; posW: number; posN: number }>();
  for (const r of rows) {
    for (const p of r.top_pages ?? []) {
      if (!p?.page) continue;
      const k = pagePath(p.page);
      const a = pageAcc.get(k) ?? { url: p.page, urlImpr: -1, clicks: 0, impressions: 0, posW: 0, posN: 0 };
      const impr = p.impressions ?? 0;
      a.clicks += p.clicks ?? 0;
      a.impressions += impr;
      if (p.position != null) {
        a.posW += p.position * Math.max(impr, 1);
        a.posN += Math.max(impr, 1);
      }
      // The variant Google showed most stands for the row.
      if (impr > a.urlImpr) {
        a.url = p.page;
        a.urlImpr = impr;
      }
      pageAcc.set(k, a);
    }
    for (const q of r.top_queries ?? []) {
      if (!q?.query) continue;
      const k = q.query.trim().toLowerCase();
      const a = queryAcc.get(k) ?? { query: q.query.trim(), clicks: 0, impressions: 0, posW: 0, posN: 0 };
      const impr = q.impressions ?? 0;
      a.clicks += q.clicks ?? 0;
      a.impressions += impr;
      if (q.position != null) {
        a.posW += q.position * Math.max(impr, 1);
        a.posN += Math.max(impr, 1);
      }
      queryAcc.set(k, a);
    }
  }
  const rank = <T extends { clicks: number; impressions: number }>(a: T, b: T) => b.clicks - a.clicks || b.impressions - a.impressions;
  const allPages: PeriodPage[] = [...pageAcc.entries()]
    .map(([path, a]) => {
      const o = ours.get(path);
      return {
        url: a.url,
        path,
        title: o?.title ?? null,
        draftId: o?.draftId ?? null,
        keyword: o?.keyword ?? null,
        clicks: a.clicks,
        impressions: a.impressions,
        position: a.posN ? a.posW / a.posN : null,
      };
    })
    .sort(rank);
  const attributed = allPages.reduce((s, p) => s + p.clicks, 0);

  const fromT = t0(from);
  const toT = t0(to) + DAY;
  const published = drafts
    .filter((d) => d.published_at && Date.parse(d.published_at) >= fromT && Date.parse(d.published_at) < toT)
    .map((d) => ({ draftId: d.id as string | null, title: d.title ?? d.published_url, url: d.published_url as string | null, at: d.published_at! }));
  // Pages the site's agent published (no draft behind them) count too.
  for (const p of sitePages) {
    if (!p.published_at || Date.parse(p.published_at) < fromT || Date.parse(p.published_at) >= toT) continue;
    if (published.some((x) => x.url && pagePath(x.url) === pagePath(p.url))) continue;
    published.push({ draftId: articleIdOf(p), title: p.title ?? p.url, url: p.url, at: p.published_at });
  }
  published.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    from,
    to,
    days,
    reportedDays: rows.length,
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : null,
    position: posN ? posW / posN : null,
    previous,
    dayRank,
    daily,
    pages: allPages.slice(0, opts.pages ?? 10),
    queries: [...queryAcc.values()]
      .sort(rank)
      .slice(0, opts.queries ?? 10)
      .map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, position: q.posN ? q.posW / q.posN : null })),
    unattributed: Math.max(0, clicks - attributed),
    published,
  };
}


// ---- hour by hour --------------------------------------------------------
// Read from gsc_hourly, which the hourly-gsc cron fills every 3 hours with
// the last ten days (gsc-hourly.ts). The page never asks anyone to retry:
//  - a recent day not saved yet (a site's first hours, before its first
//    sync): one quiet Google call now, saving what it gets; a failure still
//    reads as "pending", which the next sync fills - never an error;
//  - today or yesterday saved more than an hour ago: shown as saved, and
//    re-synced in the background after the response (next/server after()),
//    so the next view is fresh and nobody ever waits on Google.

export const HOURLY_DAYS = HOURLY_KEEP_DAYS;
/** A recent day's saved hours older than this get re-synced on view. */
const STALE_MS = 60 * 60_000;

/** One hour: `at` is its start as an ISO time with Google's Pacific offset,
 *  so a browser can show it in the viewer's own time zone. */
export type PeriodHour = {
  at: string;
  clicks: number;
  impressions: number;
  /** Not reported yet: today's later hours, or the last few Google hasn't
   *  sent. Drawn as an empty slot, never as a zero. */
  pending?: boolean;
};
export type PeriodHourly =
  | { state: "ok"; hours: PeriodHour[] }
  /** Not saved yet; the next sync (on view or scheduled) brings it. */
  | { state: "pending" }
  /** Older than anything Google still had when we started saving. */
  | { state: "tooOld" }
  | { state: "noGoogle" };

/** Every hour of the day, oldest first: Google's own hours as saved (23 on
 *  the day clocks go forward, 25 the day they go back - each its own real
 *  time), plus every hour Google left out: a zero when nobody searched, or
 *  - on a day Google is still reporting (the last two), past its latest
 *  hour - a pending slot, so "not in yet" never reads as "nobody came". */
function filled(day: StoredDay): PeriodHour[] {
  const seen = new Set(day.hours.map((x) => x.at.slice(11, 13)));
  const latest = day.hours.reduce((m, x) => Math.max(m, Date.parse(x.at)), -Infinity);
  const reporting = Date.now() - t0(day.date) < 2 * DAY;
  const quiet: PeriodHour[] = [];
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, "0");
    if (seen.has(hh)) continue;
    const at = `${day.date}T${hh}:00:00${day.utc_offset}`;
    quiet.push({ at, clicks: 0, impressions: 0, ...(reporting && Date.parse(at) > latest ? { pending: true } : {}) });
  }
  return [...day.hours.map((x) => ({ at: x.at, clicks: x.clicks, impressions: x.impressions })), ...quiet].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/** The 24 hours of one Google day (Pacific), each filled, oldest first. */
export async function getDayHourly(project: Project, date: string): Promise<PeriodHourly> {
  if (!project.gsc_site_url) return { state: "noGoogle" };
  const stored = await readHourly(project.id, date);
  if (stored) {
    const recent = Date.now() - t0(date) < 2 * DAY;
    const stale = !stored.updated_at || Date.now() - Date.parse(stored.updated_at) > STALE_MS;
    if (recent && stale) {
      const site = project.gsc_site_url;
      try {
        after(async () => {
          try {
            await syncHourly(project.id, site, await gscClientForProject(project));
          } catch {
            /* the scheduled sync covers it */
          }
        });
      } catch {
        /* outside a request scope (a script): the scheduled sync covers it */
      }
    }
    return { state: "ok", hours: filled(stored) };
  }
  // Google no longer has it, and we never saved it.
  if (Date.now() - t0(date) > (HOURLY_KEEP_DAYS + 1) * DAY) return { state: "tooOld" };
  try {
    await syncHourly(project.id, project.gsc_site_url, await gscClientForProject(project));
    const now = await readHourly(project.id, date);
    if (now) return { state: "ok", hours: filled(now) };
  } catch {
    /* the hourly sync will bring it; nothing for the owner to do */
  }
  return { state: "pending" };
}
