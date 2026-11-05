import { unstable_cache } from "next/cache";
import { gscClientForProject, gscPageSearches, type PageSearchStats } from "@/lib/gsc";
import type { Project } from "@/lib/projects";
import { fmtInt, longDate } from "../../article-status";
import type { PageDay } from "../article-data";

// One article's numbers, everything an owner asks about how it went (owner,
// 2026-11-05: "spot on Google, clicks, impressions, what people searched to
// see this, the date it was published"; then: "fewer colours, very
// informative and to the point", and the chart starts the day it came out).
// Two sources:
//
//   - Search Console asked live about THIS page since it was published: the
//     exact lifetime totals, its day-by-day numbers and the searches that
//     showed it. Our daily snapshots keep only a site's top 100 pages, so a
//     small page's numbers can only come from a page-filtered query. Cached
//     six hours per page; free; skipped quietly when Google isn't connected.
//   - the daily history we already keep (PageDay), when that read fails.
//
// Plain ink throughout: no number gets a colour of its own.

const SIX_HOURS = 6 * 3600;
const DAY = 86_400_000;

/** null = Google not connected for this site; `failed` = connected, but the
 *  read did not come back (a blip, or a deploy without the OAuth client). */
export type Searches = (PageSearchStats & { since: string; failed?: undefined }) | { failed: true } | null;

function pathOf(url: string): string | null {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, "");
    return p && p !== "/" ? p : null;
  } catch {
    return null;
  }
}

const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);

/** Search Console about this page since it went out (GSC keeps 16 months). */
export async function loadSearches(project: Project, url: string, publishedAt: string | null): Promise<Searches> {
  const site = project.gsc_site_url;
  const path = pathOf(url);
  if (!site || !path) return null;
  const floor = Date.now() - 480 * DAY;
  const start = ymd(Math.max(floor, publishedAt ? Date.parse(publishedAt) - DAY : floor));
  try {
    return await unstable_cache(
      async () => {
        const sc = await gscClientForProject(project);
        return { ...(await gscPageSearches(site, path, start, sc)), since: start };
      },
      ["article-searches-v2", project.id, path, start],
      { revalidate: SIX_HOURS },
    )();
  } catch (e) {
    console.warn(`[article] searches for ${url} not read: ${e instanceof Error ? e.message : String(e)}`);
    return { failed: true };
  }
}

/** Every day from the day it was published to Google's newest day, zeros
 *  included: the chart starts when the article came out, not when Google
 *  first showed it. Search Console's own per-day rows when they came back,
 *  else our stored history. */
export function articleSeries(stored: PageDay[], searches: Searches, publishedAt: string | null): PageDay[] {
  const live = searches && !searches.failed ? searches : null;
  const src = live?.days?.length ? live.days : stored;
  const byDate = new Map(src.map((d) => [d.date.slice(0, 10), d]));
  const first = publishedAt?.slice(0, 10) ?? src[0]?.date.slice(0, 10);
  if (!first) return [];
  const start = Math.max(dayMs(first), dayMs(ymd(Date.now() - 480 * DAY)));
  // Google runs two to three days behind: end on its newest day, or three
  // days ago when its newest row for this page is older than that.
  const newest = src.length ? dayMs(src[src.length - 1].date) : 0;
  const end = Math.max(newest, dayMs(ymd(Date.now() - 3 * DAY)));
  const out: PageDay[] = [];
  for (let t = start; t <= end; t += DAY) {
    const d = byDate.get(ymd(t));
    out.push({ date: ymd(t), clicks: d?.clicks ?? 0, impressions: d?.impressions ?? 0, position: d?.impressions ? (d.position ?? null) : null });
  }
  return out;
}

const pct = (v: number) => (v >= 0.1 ? `${(v * 100).toFixed(0)}%` : v > 0 ? `${(v * 100).toFixed(1)}%` : "0%");
const spot = (p: number | null | undefined) => (p != null && p > 0 ? `#${Math.max(1, Math.round(p))}` : "-");
const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function facts(series: PageDay[], publishedAt: string | null) {
  const withPos = series.filter((d) => d.position != null);
  const latest = withPos.length ? withPos[withPos.length - 1] : null;
  const best = withPos.reduce<PageDay | null>((b, d) => (b == null || d.position! < b.position! ? d : b), null);
  const firstShown = series.find((d) => d.impressions > 0) ?? null;
  const firstClick = series.find((d) => d.clicks > 0) ?? null;
  const bestDay = series.reduce<PageDay | null>((b, d) => (d.clicks > 0 && (b == null || d.clicks > b.clicks) ? d : b), null);
  const published = publishedAt ? dayMs(publishedAt) : null;
  const after = (d: PageDay) => {
    if (published == null) return "";
    const n = Math.max(0, Math.round((dayMs(d.date) - published) / DAY));
    return n === 0 ? "the day it went out" : `${plural(n, "day")} after publishing`;
  };
  return { latest, best, firstShown, firstClick, bestDay, after, published };
}

/** The stats row: lifetime clicks, times shown, click rate, and its spot. */
export function ArticleStats({ series, searches: s }: { series: PageDay[]; searches: Searches }) {
  const searches = s && !s.failed ? s : null;
  const { latest, best } = facts(series, null);
  const clicks = searches ? searches.totals.clicks : series.reduce((n, d) => n + d.clicks, 0);
  const impressions = searches ? searches.totals.impressions : series.reduce((n, d) => n + d.impressions, 0);
  const avg = searches?.totals.position ?? null;
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: "Clicks from Google", value: fmtInt(clicks), sub: "people who opened it from a search" },
    { label: "Times shown on Google", value: fmtInt(impressions), sub: "times it appeared in results" },
    { label: "Click rate", value: impressions ? pct(clicks / impressions) : "-", sub: impressions ? "of the times it was shown" : "not shown yet" },
    {
      label: "Spot on Google",
      value: spot(latest?.position),
      sub: latest ? `on ${longDate(latest.date)}${best && best !== latest ? ` · best ${spot(best.position)}` : ""}${avg ? ` · average ${spot(avg)}` : ""}` : "not shown yet",
    },
  ];
  return (
    <dl className="arrive-up grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft lg:grid-cols-4" style={{ "--at": "260ms" } as React.CSSProperties}>
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 bg-surface px-5 py-5 sm:px-6">
          <dt className="text-[13px] text-ink-muted">{t.label}</dt>
          <dd className="mt-1.5 text-[1.9rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{t.value}</dd>
          <dd className="mt-2 truncate text-[12.5px] text-ink-faint" title={t.sub}>
            {t.sub}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What people typed into Google before this article showed up. */
export function ArticleSearches({ searches: s, keyword }: { searches: Searches; keyword: string | null }) {
  const searches = s && !s.failed ? s : null;
  const rows = searches?.queries ?? [];
  const max = Math.max(1, ...rows.map((q) => q.impressions));
  const note = searches
    ? rows.length
      ? `From Search Console, since ${longDate(searches.since)}. Most clicks first.`
      : "No searches listed yet. Google names them once the page starts showing up."
    : s?.failed
      ? "Search Console didn't answer just now. They show up on your next visit."
      : "Connect Google Search Console to see the searches behind this article.";
  return (
    <section aria-labelledby="searches-title" className="arrive-up min-w-0 rounded-2xl border border-line-soft bg-surface" style={{ "--at": "380ms" } as React.CSSProperties}>
      <div className="px-5 py-4 sm:px-6">
        <h3 id="searches-title" className="text-[15px] font-semibold text-ink">
          Searches that showed it{rows.length ? <span className="ml-2 font-normal text-ink-faint tabular-nums">{fmtInt(rows.length)}</span> : null}
        </h3>
        <p className="mt-0.5 text-[13px] text-ink-muted">{note}</p>
      </div>
      {rows.length ? (
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-y border-line-soft text-left text-[12px] text-ink-faint">
              <th scope="col" className="px-5 py-2 font-medium sm:px-6">Search</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Clicks</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Shown</th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">Click rate</th>
              <th scope="col" className="px-5 py-2 text-right font-medium sm:px-6">Spot</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {rows.map((q) => {
              const target = keyword != null && q.query.toLowerCase() === keyword.toLowerCase();
              return (
                <tr key={q.query}>
                  <td className="relative max-w-0 px-5 py-2.5 sm:px-6">
                    {/* A quiet bar behind the search, sized by how often it showed the page. */}
                    <span aria-hidden="true" className="absolute inset-y-1.5 left-3 rounded bg-ink/[0.05] sm:left-4" style={{ width: `calc(${Math.max(4, (q.impressions / max) * 100)}% - 1.5rem)` }} />
                    <span className="relative flex min-w-0 items-center gap-2">
                      <span className="truncate text-ink" title={q.query}>
                        {q.query}
                      </span>
                      {target ? <span className="shrink-0 rounded border border-line px-1.5 text-[11px] text-ink-muted">written for</span> : null}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink">{fmtInt(q.clicks)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-ink-muted">{fmtInt(q.impressions)}</td>
                  <td className="hidden px-2 py-2.5 text-right tabular-nums text-ink-muted sm:table-cell">{q.impressions ? pct(q.clicks / q.impressions) : "-"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-muted sm:px-6">{spot(q.position)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

/** True when Search Console listed searches for the page: the searches
 *  table then sits beside the details; without it the details go full width
 *  so no column stands empty. */
export function hasSearchRows(s: Searches): boolean {
  return Boolean(s && !s.failed && s.queries.length);
}

/** The facts about it: dates and records, no decoration. A column of rows
 *  beside the searches, or a full-width grid of cells when there are none. */
export function ArticleDetails({ series, publishedAt, keyword, url, wide = false }: { series: PageDay[]; publishedAt: string | null; keyword: string | null; url: string | null; wide?: boolean }) {
  const { best, firstShown, firstClick, bestDay, after, published } = facts(series, publishedAt);
  const live = published != null ? Math.max(0, Math.floor((Date.now() - published) / DAY)) : null;
  let path: string | null = null;
  try {
    path = url ? new URL(url).pathname : null;
  } catch {
    path = url;
  }
  const rows: { label: string; value: string; sub?: string }[] = [
    { label: "Published", value: publishedAt ? longDate(publishedAt) : "-", sub: live != null ? `live ${plural(live, "day")}` : undefined },
    { label: "First shown on Google", value: firstShown ? longDate(firstShown.date) : "Not yet", sub: firstShown ? after(firstShown) : undefined },
    { label: "First click", value: firstClick ? longDate(firstClick.date) : "Not yet", sub: firstClick ? after(firstClick) : undefined },
    { label: "Best day", value: bestDay ? longDate(bestDay.date) : "Not yet", sub: bestDay ? plural(bestDay.clicks, "click") : undefined },
    { label: "Best spot", value: best ? spot(best.position) : "Not yet", sub: best ? `on ${longDate(best.date)}` : undefined },
    ...(keyword ? [{ label: "Written for", value: `“${keyword}”` }] : []),
    ...(path ? [{ label: "Address", value: path }] : []),
  ];
  if (wide) {
    return (
      <section aria-labelledby="details-title" className="arrive-up overflow-hidden rounded-2xl border border-line-soft bg-surface" style={{ "--at": "380ms" } as React.CSSProperties}>
        <h3 id="details-title" className="px-5 pt-4 text-[15px] font-semibold text-ink sm:px-6">
          Details
        </h3>
        <dl className="mt-3 grid grid-cols-2 gap-px border-t border-line-soft bg-line-soft lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0 bg-surface px-5 py-3.5 sm:px-6">
              <dt className="text-[12.5px] text-ink-muted">{r.label}</dt>
              <dd className="mt-1 truncate text-[14.5px] font-medium text-ink tabular-nums" title={r.value}>
                {r.value}
              </dd>
              {r.sub ? <dd className="truncate text-[12px] text-ink-faint">{r.sub}</dd> : null}
            </div>
          ))}
          {/* Fill the last row so the grid ends on a clean edge. */}
          {Array.from({ length: (4 - (rows.length % 4)) % 4 }, (_, i) => (
            <div key={`pad${i}`} aria-hidden="true" className="hidden bg-surface lg:block" />
          ))}
        </dl>
      </section>
    );
  }
  return (
    <section aria-labelledby="details-title" className="arrive-up rounded-2xl border border-line-soft bg-surface" style={{ "--at": "420ms" } as React.CSSProperties}>
      <h3 id="details-title" className="px-5 pt-4 text-[15px] font-semibold text-ink sm:px-6">
        Details
      </h3>
      <dl className="mt-2 divide-y divide-line-soft">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 px-5 py-2.5 sm:px-6">
            <dt className="shrink-0 text-[13px] text-ink-muted">{r.label}</dt>
            <dd className="min-w-0 text-right">
              <span className="block truncate text-[13.5px] font-medium text-ink tabular-nums" title={r.value}>
                {r.value}
              </span>
              {r.sub ? <span className="block text-[12px] text-ink-faint">{r.sub}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
