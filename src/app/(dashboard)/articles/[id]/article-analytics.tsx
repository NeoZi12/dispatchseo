import { unstable_cache } from "next/cache";
import { gscClientForProject, gscPageSearches, type PageSearchStats } from "@/lib/gsc";
import type { Project } from "@/lib/projects";
import { fmtInt, longDate } from "../../article-status";
import type { PageDay } from "../article-data";
import { ExternalIcon } from "@/components/ui/article-list";
import { cx, FOCUS_RING } from "@/components/ui/styles";

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
      ["article-searches-v3", project.id, path, start],
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

type Delta = { text: string; good: boolean | null; title: string };

/** The latest window against the one before it: 28 days against 28 once
 *  the article has 56 days of history, else 7 against 7 from 14 days, else
 *  nothing (too new to compare). Google's newest days lead the series. */
function windows(series: PageDay[]): { cur: PageDay[]; prev: PageDay[]; label: string; title: string } | null {
  const n = series.length >= 56 ? 28 : series.length >= 14 ? 7 : 0;
  if (!n) return null;
  return {
    cur: series.slice(-n),
    prev: series.slice(-2 * n, -n),
    label: n === 7 ? "this week" : "this month",
    title: n === 7 ? "The last 7 days of Google's numbers against the 7 before" : "The last 28 days of Google's numbers against the 28 before",
  };
}

/** A count's change, as "▲ 24% this week" (or "+5" when there was none before). */
function countDelta(cur: number, prev: number, w: { label: string; title: string }): Delta | null {
  if (!cur && !prev) return null;
  if (!prev) return { text: `▲ ${fmtInt(cur)} new ${w.label}`, good: true, title: w.title };
  const change = (cur - prev) / prev;
  if (Math.abs(change) < 0.005) return null;
  const p = Math.abs(change) >= 10 ? `${Math.round(Math.abs(change))}x` : `${Math.round(Math.abs(change) * 100)}%`;
  return { text: `${change > 0 ? "▲" : "▼"} ${p} ${w.label}`, good: change > 0, title: w.title };
}

/** Impression-weighted average spot over some days, or null when never shown. */
function avgSpot(days: PageDay[]): number | null {
  let w = 0;
  let sum = 0;
  for (const d of days) {
    if (d.position == null || !d.impressions) continue;
    w += d.impressions;
    sum += d.position * d.impressions;
  }
  return w ? sum / w : null;
}

/** The stats row: lifetime clicks, impressions, click rate and its spot,
 *  each with how its latest week (or month) compares with the one before. */
export function ArticleStats({ series, searches: s }: { series: PageDay[]; searches: Searches }) {
  const searches = s && !s.failed ? s : null;
  const { latest, best } = facts(series, null);
  const clicks = searches ? searches.totals.clicks : series.reduce((n, d) => n + d.clicks, 0);
  const impressions = searches ? searches.totals.impressions : series.reduce((n, d) => n + d.impressions, 0);
  const avg = searches?.totals.position ?? null;
  const w = windows(series);
  const sum = (days: PageDay[], k: "clicks" | "impressions") => days.reduce((n, d) => n + d[k], 0);
  let spotDelta: Delta | null = null;
  if (w) {
    const a = avgSpot(w.cur);
    const b = avgSpot(w.prev);
    if (a != null && b != null) {
      const moved = Math.round(b) - Math.round(a); // up the page = a smaller number
      // No move, no line: "holding" read as jargon (owner, 2026-11-05).
      spotDelta = moved ? { text: `${moved > 0 ? "▲" : "▼"} ${plural(Math.abs(moved), "spot")} ${w.label}`, good: moved > 0, title: w.title } : null;
    }
  }
  const tiles: { label: string; value: string; sub: string; delta?: Delta | null }[] = [
    { label: "Clicks from Google", value: fmtInt(clicks), sub: "people who opened it from a search", delta: w ? countDelta(sum(w.cur, "clicks"), sum(w.prev, "clicks"), w) : null },
    { label: "Impressions", value: fmtInt(impressions), sub: "times it appeared on Google", delta: w ? countDelta(sum(w.cur, "impressions"), sum(w.prev, "impressions"), w) : null },
    { label: "Click rate", value: impressions ? pct(clicks / impressions) : "-", sub: impressions ? "of the times it was shown" : "not shown yet" },
    {
      label: "Spot on Google",
      value: spot(latest?.position),
      sub: latest ? `on ${longDate(latest.date)}${best && best !== latest ? ` · best ${spot(best.position)}` : ""}${avg ? ` · average ${spot(avg)}` : ""}` : "not shown yet",
      delta: spotDelta,
    },
  ];
  return (
    <dl className="arrive-up grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line-soft bg-line-soft lg:grid-cols-4" style={{ "--at": "260ms" } as React.CSSProperties}>
      {tiles.map((t) => (
        <div key={t.label} className="min-w-0 bg-surface px-5 py-5 sm:px-6">
          <dt className="text-[13px] text-ink-muted">{t.label}</dt>
          <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="text-[1.9rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{t.value}</span>
            {t.delta ? (
              <span
                title={t.delta.title}
                className={cx(
                  "whitespace-nowrap text-[13px] font-semibold tabular-nums",
                  t.delta.good == null ? "text-ink-faint" : t.delta.good ? "text-ok" : "text-danger",
                )}
              >
                {t.delta.text}
              </span>
            ) : null}
          </dd>
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

type Fact = { label: string; value: string; sub?: string; href?: string; quiet?: boolean };
export type KeywordStats = { volume: number | null; difficulty: number | null };

/** The facts about it, big and plain: the search it targets, its best
 *  spot, when it went out and its address. A full-width
 *  grid under the chart (the last cell stretches so no cell stands empty),
 *  or a column beside the searches. */
export function ArticleDetails({
  series,
  publishedAt,
  keyword,
  keywordStats,
  searches: s,
  url,
  wide = false,
}: {
  series: PageDay[];
  publishedAt: string | null;
  keyword: string | null;
  /** The target keyword's monthly searches and difficulty, when research measured them. */
  keywordStats?: KeywordStats | null;
  searches?: Searches;
  url: string | null;
  wide?: boolean;
}) {
  const searches = s && !s.failed ? s : null;
  const { best, published } = facts(series, publishedAt);
  const live = published != null ? Math.max(0, Math.floor((Date.now() - published) / DAY)) : null;
  let path: string | null = null;
  try {
    path = url ? new URL(url).pathname : null;
  } catch {
    path = url;
  }
  // Only what matters about it (owner, 2026-11-05: no "first shown",
  // "first click" or "best day" - the search it targets, its best spot,
  // when it went out, where it lives).
  const kwSub = [
    keywordStats?.volume != null ? `${fmtInt(keywordStats.volume)} searches a month` : null,
    keywordStats?.difficulty != null ? `difficulty ${Math.round(keywordStats.difficulty)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const items: Fact[] = [
    ...(keyword ? [{ label: "Target keyword", value: keyword, sub: kwSub || undefined }] : []),
    ...(searches
      ? [
          {
            label: "Shows up for",
            value: searches.queryCount ? plural(searches.queryCount, "search", "searches") + (searches.queryCount >= 250 ? "+" : "") : "No searches yet",
            sub: searches.queryCount ? "different searches on Google" : undefined,
            quiet: !searches.queryCount,
          },
        ]
      : []),
    { label: "Best spot on Google", value: best ? spot(best.position) : "Not yet", sub: best ? `on ${longDate(best.date)}` : undefined, quiet: !best },
    { label: "Published", value: publishedAt ? longDate(publishedAt) : "-", sub: live != null ? `live ${plural(live, "day")}` : undefined },
    ...(path ? [{ label: "Address", value: path, href: url ?? undefined }] : []),
  ];
  // How many columns the last row's final cell spans so the row ends flush.
  const restLg = (3 - (items.length % 3)) % 3;
  const restSm = items.length % 2;
  return (
    <section
      aria-labelledby="details-title"
      className="arrive-up min-w-0 overflow-hidden rounded-2xl border border-line-soft bg-surface"
      style={{ "--at": wide ? "380ms" : "420ms" } as React.CSSProperties}
    >
      <h3 id="details-title" className="px-6 py-5 text-[1.25rem] font-semibold tracking-tight text-ink sm:px-7">
        Details
      </h3>
      {wide ? (
        <dl className="grid grid-cols-1 gap-px border-t border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => {
            const last = i === items.length - 1;
            return (
              <div
                key={f.label}
                className={cx(
                  "min-w-0 bg-surface px-6 py-6 sm:px-7",
                  last && restSm ? "sm:col-span-2" : "",
                  // lg always says its own span, so it overrides sm's.
                  last && (restSm || restLg) ? ["lg:col-span-1", "lg:col-span-2", "lg:col-span-3"][restLg] : "",
                )}
              >
                <dt className="text-[14px] font-medium text-ink-muted">{f.label}</dt>
                <FactValue f={f} className="mt-2 text-[1.5rem] leading-tight" />
                {f.sub ? <dd className="mt-1.5 truncate text-[14px] text-ink-faint">{f.sub}</dd> : null}
              </div>
            );
          })}
        </dl>
      ) : (
        <dl className="divide-y divide-line-soft border-t border-line-soft">
          {items.map((f) => (
            <div key={f.label} className="px-6 py-4">
              <dt className="text-[14px] font-medium text-ink-muted">{f.label}</dt>
              <FactValue f={f} className="mt-1 text-[1.2rem] leading-tight" />
              {f.sub ? <dd className="mt-1 truncate text-[13.5px] text-ink-faint">{f.sub}</dd> : null}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function FactValue({ f, className }: { f: Fact; className: string }) {
  if (f.href) {
    return (
      <dd className={cx("min-w-0", className)}>
        <a href={f.href} target="_blank" rel="noopener noreferrer" title={f.value} className={cx("group inline-flex max-w-full items-center gap-2 rounded-sm font-semibold tracking-tight text-ink hover:text-accent", FOCUS_RING)}>
          <span className="truncate">{f.value}</span>
          <ExternalIcon className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-accent" />
        </a>
      </dd>
    );
  }
  return (
    <dd className={cx("truncate font-semibold tracking-tight tabular-nums", f.quiet ? "text-ink-faint" : "text-ink", className)} title={f.value}>
      {f.value}
    </dd>
  );
}
