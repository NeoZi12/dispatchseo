"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CountUp } from "./count-up";
import { unpackDays, type Landed, type LandedPage } from "./overview-pack";
import { cx, FOCUS_RING } from "./styles";

// The overview: the first thing on Home and on Results, shaped like Polar's
// (and PaperBot's admin, which borrowed it first). One card. A quiet label,
// a big number, the period it covers, then a tall chart of that number;
// under it the card splits in two along a hairline, each half the same
// shape smaller. One series per chart, each in its own colour (people green,
// times seen blue, articles published in the range violet) carried by its line, its dots and the
// ring in its period line - so no legend, and no y-axis: the number above
// says the total and hovering says the day.
//
// The drawing is SVG stretched with preserveAspectRatio="none"; anything
// that must not stretch (dates, dots, gridlines, the hover readout) is HTML
// laid over it by percentage. Hand-rolled: the repo bans chart libraries.
//
// Under the halves, when the caller has the lists: "Your top posts" -
// the pages those people opened, ranked by clicks for the range that's
// switched on (clicks first, then times seen, so a site with no clicks yet
// still gets a ranked list), each with its spot, impressions and clicks. The range is named again there, and under the big chart, so a
// reader scrolling past the switch still knows what period they're seeing.
//
// It builds itself on first load (globals.css "Arrival"): gridlines fade
// in, the lines wipe in left to right with the fill settling in behind
// them, the numbers count up. A range switch
// redraws only the lines, quickly.

export type OverviewDay = { date: string; clicks: number; impressions: number; position?: number | null };
/** One live article, for the "Articles live" bars: when, what, and its page. */
export type LiveArticle = { at: string; title: string; href: string | null };

// `short` is what a phone shows: five buttons that fit a 390px screen
// whole, in words rather than "7d" codes.
const RANGES = [
  { key: "7d", label: "7 days", short: "Week", days: 7 },
  { key: "30d", label: "30 days", short: "Month", days: 30 },
  { key: "3m", label: "3 months", short: "3 months", days: 91 },
  { key: "12m", label: "12 months", short: "Year", days: 365 },
  { key: "all", label: "All time", short: "All", days: null },
] as const;

type Tone = "ok" | "info" | "accent";
const TONE: Record<Tone, { stroke: string; bg: string; ring: string; border: string }> = {
  ok: { stroke: "var(--color-ok)", bg: "bg-ok", ring: "ring-ok/20", border: "border-ok" },
  info: { stroke: "var(--color-info)", bg: "bg-info", ring: "ring-info/20", border: "border-info" },
  accent: { stroke: "var(--color-accent)", bg: "bg-accent", ring: "ring-accent/20", border: "border-accent" },
};
type RangeKey = (typeof RANGES)[number]["key"];

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const W = 600;
const H = 200;
const TOP = 14;

const ms = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
function short(t: number): string {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
function fullDate(iso: string): string {
  const t = ms(iso);
  return `${short(t)}, ${new Date(t).getUTCFullYear()}`;
}
function period(from: number, to: number): string {
  const a = new Date(from);
  const b = new Date(to);
  return a.getUTCFullYear() === b.getUTCFullYear()
    ? `${short(from)} – ${short(to)}, ${b.getUTCFullYear()}`
    : `${short(from)}, ${a.getUTCFullYear()} – ${short(to)}, ${b.getUTCFullYear()}`;
}

type Bucket = { start: number; end: number; clicks: number; impressions: number; articles: number; posW: number; posN: number; live: LiveArticle[] };

/** Split [from, to] into buckets of `size` days, counted back from `to` so
 *  the newest bucket is always whole. */
function bucketize(from: number, to: number, size: number): Bucket[] {
  const out: Bucket[] = [];
  for (let end = to; end >= from; end -= size * DAY) {
    out.unshift({ start: Math.max(from, end - (size - 1) * DAY), end, clicks: 0, impressions: 0, articles: 0, posW: 0, posN: 0, live: [] });
  }
  return out;
}

// Monotone cubic: smooth, and never dips below zero or above a peak that
// wasn't there.
function curve(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return "";
  const d = ys.slice(0, -1).map((y, i) => (ys[i + 1] - y) / (xs[i + 1] - xs[i]));
  const m = ys.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let p = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const dx = xs[i + 1] - xs[i];
    p += ` C${(xs[i] + dx / 3).toFixed(1)},${(ys[i] + (m[i] * dx) / 3).toFixed(1)} ${(xs[i + 1] - dx / 3).toFixed(1)},${(ys[i + 1] - (m[i + 1] * dx) / 3).toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return p;
}

/** First, last, and evenly between: the dates that get a label and a guide. */
function ticks(n: number, want: number): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (want - 1);
  return Array.from({ length: want }, (_, i) => Math.round(i * step));
}

const css = (v: Record<string, string | number>) => v as React.CSSProperties;

export function OverviewChart({
  daily: packed,
  published = [],
  publishedCapped = false,
  page = false,
  landed,
  connectAction,
  className = "",
}: {
  /** Google's daily numbers, any order, any length, packed (overview-pack.ts). */
  daily: string;
  /** Every live article (when, title, page). The site overview's second half. */
  published?: LiveArticle[];
  /** One article's numbers: the second half is its spot on Google (now and
   *  best, lower is better) instead of articles live. */
  page?: boolean;
  /** The list is a recent slice: say "50+" rather than a wrong total. */
  publishedCapped?: boolean;
  /** The pages the clicks landed on, one ranked list per range (overview-pack.ts).
   *  Given: the card grows a third section under the halves. */
  landed?: Landed;
  /** Set when Google isn't connected: shown where the big chart would be. */
  connectAction?: React.ReactNode;
  className?: string;
}) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [switched, setSwitched] = useState(false);
  const r = RANGES.find((x) => x.key === range) ?? RANGES[1];

  const rows: OverviewDay[] = unpackDays(packed).sort((a, b) => a.date.localeCompare(b.date));
  // Anchored to the newest day Google has reported, not today: its numbers
  // run two to three days behind, and a window ending today would end on a
  // run of empty days that read as a crash.
  const to = rows.length ? ms(rows[rows.length - 1].date) : ms(new Date().toISOString());
  const firstEver = Math.min(rows.length ? ms(rows[0].date) : to, ...published.map((p) => ms(p.at)));
  const from = r.days == null ? firstEver : to - (r.days - 1) * DAY;
  const span = Math.round((to - from) / DAY) + 1;

  // Daily up to three months; weekly up to two years; monthly past that.
  const size = span > 730 ? 30 : span > 92 ? 7 : 1;
  const buckets = bucketize(from, to, size);
  const at = (t: number) => buckets.findIndex((b) => t >= b.start && t <= b.end);
  for (const d of rows) {
    const i = at(ms(d.date));
    if (i < 0) continue;
    buckets[i].clicks += d.clicks;
    buckets[i].impressions += d.impressions;
    if (d.position != null) {
      // Impression-weighted, so a day it ranked #3 for many searches
      // outweighs a #40 blip; a listed day with no impressions still counts.
      const w = Math.max(d.impressions, 1);
      buckets[i].posW += d.position * w;
      buckets[i].posN += w;
    }
  }
  const clicks = buckets.reduce((s, b) => s + b.clicks, 0);
  const impressions = buckets.reduce((s, b) => s + b.impressions, 0);
  const newInRange = published.filter((p) => ms(p.at) >= from && ms(p.at) <= to).length;
  // A capped list only knows the range is complete when its oldest article
  // is older than the range; otherwise say "18+" rather than a wrong count.
  const oldestKnown = published.length ? Math.min(...published.map((p) => ms(p.at))) : Infinity;
  const inRangeCapped = publishedCapped && oldestKnown >= from;
  // Change against the same length of time just before - only when that
  // window was mostly reported, so a young site doesn't "grow 900%".
  let delta: number | null = null;
  if (r.days != null) {
    const prevFrom = from - r.days * DAY;
    const prev = rows.filter((d) => ms(d.date) >= prevFrom && ms(d.date) < from);
    const prevClicks = prev.reduce((s, d) => s + d.clicks, 0);
    if (prev.length >= r.days / 2 && prevClicks > 0) delta = Math.round(((clicks - prevClicks) / prevClicks) * 100);
  }
  const when = period(from, to);
  // The page's spot: where it is on the newest day in range, and its best
  // day in range (daily precision, so the date is a real day).
  const inRange = rows.filter((d) => ms(d.date) >= from && d.position != null);
  const now = inRange.length ? inRange[inRange.length - 1].position! : null;
  const best = inRange.reduce<OverviewDay | null>((b, d) => (b == null || d.position! < b.position! ? d : b), null);
  const sinceWord = r.days == null ? "since the start" : `on the ${r.label} before`;
  // Named under the big chart and over the landed list: "Last 30 days",
  // "All time".
  const rangeName = r.days == null ? "All time" : `Last ${r.label}`;

  const pick = (k: RangeKey) => {
    if (k === range) return;
    setRange(k);
    setSwitched(true);
  };

  return (
    <section
      aria-labelledby="overview-title"
      className={cx("arrive-up overflow-hidden rounded-2xl border border-line-soft bg-surface", className)}
      style={css({ "--at": "180ms" })}
    >
      <h2 id="overview-title" className="sr-only">
        Overview
      </h2>
      <div className="px-5 pt-6 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <Head
            label="People from Google"
            value={<CountUp value={clicks} />}
            when={when}
            tone="ok"
            big
            aside={
              delta == null || connectAction ? null : (
                <span className={cx("text-[14px] font-medium", delta > 0 ? "text-ok" : "text-ink-muted")}>
                  {delta === 0 ? "about the same" : `${delta > 0 ? "up" : "down"} ${Math.abs(delta)}%`}
                  <span className="sr-only"> {sinceWord}</span>
                </span>
              )
            }
          />
          <div role="group" aria-label="Date range" className="flex max-w-full flex-wrap rounded-lg bg-canvas/70 p-0.5 ring-1 ring-line-soft">
            {RANGES.map((x) => (
              <button
                key={x.key}
                type="button"
                aria-pressed={x.key === range}
                onClick={() => pick(x.key)}
                className={cx(
                  "shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors sm:px-3",
                  x.key === range ? "bg-surface-3 text-ink shadow-sm shadow-black/30" : "text-ink-faint hover:text-ink",
                  FOCUS_RING,
                )}
              >
                <span className="sm:hidden">{x.short}</span>
                <span className="hidden sm:inline">{x.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mt-7">
          {connectAction ? (
            <div className="flex h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-line px-6 text-center sm:h-64">
              <p className="max-w-sm text-[15px] leading-relaxed text-ink-muted">Connect Google and this fills with the people it sends you, day by day.</p>
              {connectAction}
            </div>
          ) : rows.length < 2 ? (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-line px-6 text-center sm:h-64">
              <p className="max-w-sm text-[15px] leading-relaxed text-ink-muted">
                No one from Google yet. Google&apos;s numbers run two to three days behind, so this fills in on its own.
              </p>
            </div>
          ) : (
            <Area
              buckets={buckets}
              value={(b) => b.clicks}
              format={(v) => `${v.toLocaleString("en-US")} ${v === 1 ? "person" : "people"}`}
              size={size}
              tone="ok"
              heightClass="h-56 sm:h-64"
              want={6}
              at={420}
              redraw={switched ? range : null}
              hover
            />
          )}
        </div>
        {connectAction || rows.length < 2 ? null : (
          <p className="arrive-in mt-4 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-faint" style={css({ "--at": "900ms" })} aria-live="polite">
            <span className="font-medium text-ink-muted">{rangeName}</span>
            <span aria-hidden="true">·</span>
            <span>{when}</span>
          </p>
        )}
      </div>

      <div className="mt-8 grid border-t border-line-soft sm:grid-cols-2">
        {connectAction ? null : (
          <div className="px-5 py-6 sm:border-r sm:border-line-soft sm:px-8">
            <Head label="Times you showed up on Google" value={<CountUp value={impressions} />} when={when} tone="info" />
            {rows.length >= 2 ? (
              <div className="mt-5">
                <Area
                  buckets={buckets}
                  value={(b) => b.impressions}
                  format={(v) => `${v.toLocaleString("en-US")} ${v === 1 ? "time" : "times"}`}
                  size={size}
                  tone="info"
                  heightClass="h-24"
                  want={3}
                  at={720}
                  redraw={switched ? range : null}
                  hover
                />
              </div>
            ) : null}
          </div>
        )}
        {page ? (
          <div className="border-t border-line-soft px-5 py-6 sm:border-t-0 sm:px-8">
            <p className="text-[14px] font-medium text-ink-muted">Spot on Google</p>
            {/* Two figures, side by side: where it is, and the best it got. */}
            <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-[12.5px] text-ink-faint">Now</p>
                <p className="mt-1 text-[2rem] font-semibold leading-none tracking-tight text-ink tabular-nums">{now == null ? "-" : `#${Math.max(1, Math.round(now))}`}</p>
              </div>
              <div>
                <p className="text-[12.5px] text-ink-faint">Best</p>
                <p className="mt-1 text-[2rem] font-semibold leading-none tracking-tight text-accent tabular-nums">
                  {best?.position == null ? "-" : `#${Math.max(1, Math.round(best.position))}`}
                </p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-faint">
              <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full border-[1.5px]", TONE.accent.border)} />
              {best ? `Best on ${short(ms(best.date))}. #1 is the top of Google.` : "Not on Google in this range yet."}
            </p>
            {inRange.length >= 2 ? (
              <div className="mt-5">
                <Area
                  buckets={buckets}
                  value={(b) => (b.posN ? b.posW / b.posN : null)}
                  format={(v) => `spot #${Math.max(1, Math.round(v))}`}
                  invert
                  size={size}
                  tone="accent"
                  heightClass="h-24"
                  want={3}
                  at={800}
                  redraw={switched ? range : null}
                  hover
                />
              </div>
            ) : null}
          </div>
        ) : (
        <div className={cx("px-5 py-6 sm:px-8", connectAction ? "sm:col-span-2" : "border-t border-line-soft sm:border-t-0")}>
          {/* The range's own count is the figure, like the two beside it;
              the all-time total is the quiet line under it. */}
          <Head
            label="Articles published"
            value={
              <>
                <CountUp value={newInRange} />
                {inRangeCapped ? "+" : null}
              </>
            }
            when={`${rangeName === "All time" ? "Since the start" : rangeName} · ${published.length}${publishedCapped ? "+" : ""} live in total`}
            tone="accent"
          />
          <div className="mt-5">
            <PublishCalendar from={from} to={to} published={published} redraw={switched ? range : null} />
          </div>
        </div>
        )}
      </div>

      {landed && !connectAction && !page ? (
        <LandedList rows={landed[range] ?? []} rangeName={rangeName} when={when} redraw={switched ? range : null} />
      ) : null}
    </section>
  );
}

/** How many landed rows show before "Show all". */
const LANDED_SHOWN = 8;

/** 12,345 in full; past 100k, "123k" so the column keeps its width. */
export function compact(v: number): string {
  return v >= 100_000 ? `${Math.round(v / 1000)}k` : v.toLocaleString("en-US");
}

/** A magnifier: the Impressions column's mark (an impression is showing
 *  up in a search). Gray on purpose - the clicks carry the colour. */
export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <circle cx="8.5" cy="8.5" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="m12.3 12.3 4.2 4.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** A pointer mid-click: the Clicks column's mark. */
export function ClickIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={className}>
      <path d="M8 7.5 15.5 10l-3.2 1.3 2.6 3.4-1.6 1.2-2.6-3.4-1.9 2.8Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6 2.5v2.2M2.5 6h2.2M3.4 3.4l1.5 1.5M9.6 3.4 8.1 4.9M3.4 9.6l1.5-1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** The pages the range's clicks landed on, best first, made to feel like a
 *  reward: each row's click count is the big figure (the way a video's
 *  views are), with its rank and its name on the left, and its spot on
 *  Google beside the count. The right side is
 *  fixed-width columns, so spots, counts and arrows line up row to row.
 *  The whole row opens the live post in a new tab. The top three ranks
 *  carry the green, the rest stay quiet. Rows arrive one after another and
 *  re-arrive quickly when the range switches, like the lines above. */
function LandedList({ rows, rangeName, when, redraw }: { rows: LandedPage[]; rangeName: string; when: string; redraw: string | null }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, LANDED_SHOWN);
  const hidden = rows.length - shown.length;
  const quick = redraw != null;
  return (
    <div className="border-t border-line-soft px-5 py-6 sm:px-8" aria-labelledby="landed-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id="landed-title" className="text-[14px] font-medium text-ink-muted">
          Your top posts
        </h3>
        <p className="flex items-center gap-2 text-[12.5px] text-ink-faint">
          <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full border-[1.5px]", TONE.ok.border)} />
          <span className="font-medium text-ink-muted">{rangeName}</span>
          <span aria-hidden="true">·</span>
          <span>{when}</span>
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-line px-5 py-6 text-center text-[14px] text-ink-muted">No post showed up on Google in this range yet.</p>
      ) : (
        <ol key={redraw ?? "first"} className="-mx-3 mt-3 space-y-1">
          {shown.map((p, i) => {
            const name = p.title ?? p.path;
            const podium = i < 3;
            return (
              <li key={p.path} className="arrive-up" style={css({ "--at": quick ? "0ms" : "960ms", "--i": i, "--step": quick ? "30ms" : "55ms" })}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cx("group flex items-center gap-4 rounded-xl px-3 py-3.5 transition-colors hover:bg-surface-2 sm:gap-5", FOCUS_RING)}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold tabular-nums",
                      podium ? "bg-ok/12 text-ok ring-1 ring-ok/25" : "bg-surface-3/70 text-ink-faint",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="sr-only">Number {i + 1}: </span>
                    <span className="block truncate text-[15px] font-medium text-ink transition-colors group-hover:text-ok" title={name}>
                      {name}
                    </span>
                    {p.publishedAt ? (
                      <span className="mt-1 block text-[12.5px] text-ink-faint">Published on {fullDate(p.publishedAt)}</span>
                    ) : null}
                  </span>
                  {/* Its spot on Google: its own fixed column, the same two-line shape as
                      the count beside it so the labels share a baseline. */}
                  <span className="hidden w-20 shrink-0 text-center sm:block">
                    <span className="block text-[1.125rem] font-semibold leading-7 tabular-nums text-ink-muted">
                      {p.position == null ? "-" : `#${Math.max(1, Math.round(p.position))}`}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">On Google</span>
                  </span>
                  {/* Impressions: how often Google showed it. */}
                  <span className="hidden w-28 shrink-0 text-center sm:block">
                    <span className="flex items-center justify-center gap-1.5">
                      <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span className="text-[1.125rem] font-semibold leading-7 tabular-nums text-ink-muted">{compact(p.impressions)}</span>
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">Impressions</span>
                  </span>
                  {/* Clicks: icon and figure as one right-aligned unit, one
                      size on every row, so the numbers stack cleanly. */}
                  <span className="w-24 shrink-0 text-right">
                    <span className="flex items-center justify-end gap-1.5">
                      <ClickIcon className={cx("h-[18px] w-[18px] shrink-0", podium ? "text-ok" : "text-ink-faint")} />
                      <span className={cx("text-[1.625rem] font-semibold leading-7 tracking-tight tabular-nums", podium ? "text-ink" : "text-ink-muted")}>
                        {p.clicks.toLocaleString("en-US")}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                      {p.clicks === 1 ? "Click" : "Clicks"}
                      <span className="sm:hidden">
                        {" "}
                        · {compact(p.impressions)} impressions{p.position == null ? "" : ` · #${Math.max(1, Math.round(p.position))}`}
                      </span>
                    </span>
                  </span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-4 w-4 shrink-0 text-ink-faint transition-[color,transform] duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ok"
                  >
                    <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="sr-only">(opens the post in a new tab)</span>
                </a>
              </li>
            );
          })}
        </ol>
      )}
      {hidden > 0 || all ? (
        <button type="button" onClick={() => setAll((v) => !v)} className={cx("mt-3 text-[13px] font-medium text-accent", FOCUS_RING, "rounded-sm")}>
          {all ? "Show fewer" : `Show all ${rows.length} posts`}
        </button>
      ) : null}
    </div>
  );
}

/** Polar's head: a quiet label, the number, the period under it with a
 *  ring dot. */
function Head({
  label,
  value,
  when,
  big = false,
  tone,
  aside,
}: {
  label: string;
  value: React.ReactNode;
  when: string;
  tone: Tone;
  big?: boolean;
  aside?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-ink-muted">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={cx("font-semibold leading-none tracking-tight text-ink tabular-nums", big ? "text-[2.75rem] sm:text-[3.25rem]" : "text-[2rem]")}>
          {value}
        </span>
        {aside}
      </p>
      <p className="mt-3 flex items-center gap-2 text-[12.5px] text-ink-faint">
        <span aria-hidden="true" className={cx("h-2 w-2 shrink-0 rounded-full border-[1.5px]", TONE[tone].border)} />
        {when}
      </p>
    </div>
  );
}

function bucketLabel(b: Bucket, size: number): string {
  if (size === 1) return short(b.start);
  if (size === 7) return `Week of ${short(b.start)}`;
  const d = new Date(b.start);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Area({
  buckets,
  value,
  format,
  invert = false,
  size,
  tone,
  heightClass,
  want,
  at,
  redraw,
  hover: hoverable = false,
  detail,
}: {
  buckets: Bucket[];
  /** null = no reading that period (a gap, not a zero). */
  value: (b: Bucket) => number | null;
  /** The hover readout's figure, e.g. "23 people". */
  format: (v: number) => string;
  /** Lower is better (a Google position): best at the top. */
  invert?: boolean;
  size: number;
  tone: Tone;
  heightClass: string;
  want: number;
  /** Arrival delay (ms) for the first draw. */
  at: number;
  /** Set after a range switch: remount the line and redraw it quickly. */
  redraw: string | null;
  hover?: boolean;
  /** Extra lines under the readout's figure, e.g. what went live that day. */
  detail?: (b: Bucket) => React.ReactNode;
}) {
  const gradient = useId();
  // The hover readout stays mounted once used: `hover` is where it points,
  // `shown` whether it's visible (a 120ms fade, not a pop), `glide` whether
  // a move should slide there (off for the first frame after entering, so
  // it appears where the pointer is instead of sliding in from where it
  // last left).
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [glide, setGlide] = useState(false);
  const n = buckets.length;
  const vals = buckets.map(value);
  // Only periods with a reading are drawn; the line bridges the gaps.
  const def = vals.flatMap((v, i) => (v == null ? [] : [i]));
  const dv = def.map((i) => vals[i]!);
  const lo = dv.length ? Math.min(...dv) : 0;
  const hi = dv.length ? Math.max(...dv) : 1;
  const max = Math.max(1, hi) * 1.14;
  const y = (v: number) => (invert ? TOP + ((v - lo) / Math.max(hi - lo, 1)) * (H - TOP - 16) : TOP + (1 - v / max) * (H - TOP));
  const xs = buckets.map((_, i) => (n < 2 ? W / 2 : (i * W) / (n - 1)));
  const ys = vals.map((v) => (v == null ? H : y(v)));
  const line = curve(def.map((i) => xs[i]), def.map((i) => ys[i]));
  const area = line ? `${line} L${xs[def[def.length - 1]]},${H} L${xs[def[0]]},${H} Z` : "";
  const tk = ticks(n, want);
  const pos = (i: number) => ({ left: `${(xs[i] / W) * 100}%`, top: `${(ys[i] / H) * 100}%` });
  const lastDef = def.length ? def[def.length - 1] : n - 1;
  const quick = redraw != null;
  const c = TONE[tone];

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    if (!def.length) return;
    // Snap to the nearest period that has a reading.
    const i = def.reduce((b, d) => (Math.abs(d - raw) < Math.abs(b - raw) ? d : b), def[0]);
    setHover(i);
    setGlide(shown);
    setShown(true);
  }
  // Day to day, the guide, the dot and the readout slide (easeOutExpo,
  // 160ms - short enough to land as the pointer settles, so it never trails
  // a stopped mouse) while the readout's text swaps in place. Reduced
  // motion: no slide, no fade.
  const motion: React.CSSProperties = {
    transition: glide
      ? "left 160ms var(--ease-out-expo), top 160ms var(--ease-out-expo), transform 160ms var(--ease-out-expo), opacity 120ms ease-out"
      : "opacity 120ms ease-out",
    opacity: shown ? 1 : 0,
  };

  return (
    <div>
      <div
        className={cx("relative touch-none select-none", heightClass)}
        onPointerMove={hoverable ? onMove : undefined}
        onPointerDown={hoverable ? onMove : undefined}
        onPointerLeave={hoverable ? () => setShown(false) : undefined}
      >
        {/* Dashed guides at the labelled dates, like Polar's. */}
        {tk.map((i, k) => (
          <span
            key={`g${i}`}
            aria-hidden="true"
            className="arrive-in absolute inset-y-0 w-px border-l border-dashed border-line"
            style={css({ left: `${(xs[i] / W) * 100}%`, "--at": `${at - 120}ms`, "--i": k, "--step": "45ms" })}
          />
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.stroke} stopOpacity="0.2" />
              <stop offset="100%" stopColor={c.stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            key={`a${redraw ?? ""}`}
            d={area}
            fill={`url(#${gradient})`}
            className="arrive-in"
            style={css({ "--at": quick ? "120ms" : `${at + 260}ms` })}
          />
          <path
            key={`l${redraw ?? ""}`}
            d={line}
            fill="none"
            stroke={c.stroke}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className={quick ? "arrive-wipe-quick" : "arrive-wipe"}
            style={css({ "--at": `${at}ms` })}
          />
        </svg>
        {/* Where the line ends today: a dot, landing after the line does.
            HTML so the stretched svg can't turn it into an egg. */}
        <span
          key={`d${redraw ?? ""}`}
          aria-hidden="true"
          className={cx("arrive-in pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4", c.bg, c.ring)}
          style={css({ ...pos(lastDef), "--at": quick ? "300ms" : `${at + 700}ms` })}
        />
        {hover != null && hover < n ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/50 motion-reduce:transition-none!" style={{ ...motion, left: pos(hover).left }} />
            <span
              aria-hidden="true"
              className={cx("pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface motion-reduce:transition-none!", c.bg)}
              style={{ ...motion, ...pos(hover) }}
            />
            <span
              className="pointer-events-none absolute -top-3 z-10 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] shadow-xl shadow-black/40 motion-reduce:transition-none!"
              style={{
                ...motion,
                left: pos(hover).left,
                transform: n > 1 && hover / (n - 1) > 0.75 ? "translateX(calc(-100% - 10px))" : n > 1 && hover / (n - 1) < 0.25 ? "translateX(10px)" : "translateX(-50%)",
              }}
            >
              <span className="block text-ink-faint">{bucketLabel(buckets[hover], size)}</span>
              <span className="mt-0.5 block text-ink">
                <span className="font-semibold tabular-nums">{vals[hover] == null ? "-" : format(vals[hover]!)}</span>
              </span>
              {detail ? detail(buckets[hover]) : null}
            </span>
          </>
        ) : null}
      </div>
      <Dates labels={tk.map((i) => ({ i, text: size === 30 ? bucketLabel(buckets[i], size) : short(buckets[i].start) }))} n={n} xs={xs} />
    </div>
  );
}

/** The days an article went live, as a calendar, publish days violet. Each
 *  range gets its own layout, and every layout fills the half card's width:
 *    7 days     a row of seven tall day tiles (weekday, date)
 *    30 days    a month calendar, Monday-first, a dated cell per day
 *    3 months   the months it touches, side by side as small calendars
 *    longer     a week-per-column grid, capped at 12 months and starting a
 *               little before the first article - months before anything
 *               was published are just empty squares
 *  Only violet days answer the pointer: hover names what went live, click
 *  opens it. A day with several articles carries a small dot. (Tried and
 *  dropped before this: full-height bars, a running-total line, tiles on a
 *  timeline - none read as "the days we published".) */
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** The shortest week grid: fewer weeks would stretch squares into strips. */
const MIN_WEEKS = 16;
function PublishCalendar({ from, to, published, redraw }: { from: number; to: number; published: LiveArticle[]; redraw: string | null }) {
  const router = useRouter();
  const [hover, setHover] = useState<number | null>(null);
  const span = Math.round((to - from) / DAY) + 1;
  // Long ranges stop at a year, and start a little before the first
  // article (but never under MIN_WEEKS) so empty months don't fill the box.
  let start = from;
  if (span > 92) {
    start = Math.max(from, to - 364 * DAY);
    const first = published.reduce((m, p) => Math.min(m, ms(p.at)), Infinity);
    if (Number.isFinite(first)) start = Math.max(start, Math.min(first - 7 * DAY, to - (MIN_WEEKS * 7 - 1) * DAY));
  }
  const byDay = new Map<number, LiveArticle[]>();
  for (const p of published) {
    const t = ms(p.at);
    if (t < start || t > to) continue;
    byDay.set(t, [...(byDay.get(t) ?? []), p]);
  }
  const dow = (t: number) => (new Date(t).getUTCDay() + 6) % 7;
  const go = (list: LiveArticle[]) => {
    const href = list.find((a) => a.href)?.href;
    if (href) router.push(href);
  };
  const enter = (i: number) => css({ "--at": redraw ? "0ms" : "820ms", "--i": i, "--step": "5ms" });

  /** One day. `look` is its shape; `edge` keeps its readout inside the card;
   *  `outside` is how a day beyond the range shows (blank by default). */
  const day = (
    t: number,
    i: number,
    edge: "left" | "mid" | "right",
    look: string,
    children?: React.ReactNode,
    outside = "",
  ) => {
    const list = t >= start && t <= to ? byDay.get(t) : undefined;
    if (t < start || t > to) return <span key={t} aria-hidden="true" className={cx(look, outside)} />;
    if (!list)
      return (
        <span key={t} aria-hidden="true" className={cx(look, "arrive-in bg-surface-2 text-ink-faint")} style={enter(i)}>
          {children}
        </span>
      );
    const on = hover === t;
    return (
      <span
        key={t}
        role="link"
        tabIndex={0}
        aria-label={`${short(t)}: ${list.map((a) => a.title).join("; ")}`}
        onPointerEnter={() => setHover(t)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(t)}
        onBlur={() => setHover(null)}
        onClick={() => go(list)}
        onKeyDown={(e) => {
          if (e.key === "Enter") go(list);
        }}
        className={cx(
          look,
          "arrive-in relative cursor-pointer bg-accent text-canvas outline-none transition-shadow duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
          on ? "z-10 shadow-[0_0_14px_2px_rgb(167_139_250/0.55)]" : "",
        )}
        style={enter(i)}
      >
        {children}
        {list.length > 1 ? <span aria-hidden="true" className="absolute right-[3px] top-[3px] h-[5px] w-[5px] rounded-full bg-canvas/75" /> : null}
        {on ? (
          <span
            className={cx(
              "pointer-events-none absolute bottom-full z-20 mb-2 w-max max-w-[16rem] rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-[12.5px] font-normal shadow-xl shadow-black/40",
              edge === "left" ? "left-0" : edge === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
            )}
          >
            <span className="block text-ink-faint">
              {short(t)}
              {list.length > 1 ? `, ${list.length} articles` : ""}
            </span>
            {list.slice(0, 3).map((a, k) => (
              <span key={k} className="mt-0.5 block truncate text-ink">
                {a.title}
              </span>
            ))}
            {list.length > 3 ? <span className="mt-0.5 block text-ink-muted">+{list.length - 3} more</span> : null}
          </span>
        ) : null}
      </span>
    );
  };
  const edgeOf = (k: number, n: number): "left" | "mid" | "right" => (k < n * 0.3 ? "left" : k >= n * 0.7 ? "right" : "mid");

  // ---- 7 days: a row of tall day tiles ----
  if (span <= 7) {
    const days = Array.from({ length: span }, (_, k) => start + k * DAY);
    return (
      <div key={redraw ?? "first"} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((t, i) =>
          day(
            t,
            i,
            edgeOf(i, days.length),
            "flex h-24 flex-col items-center justify-center gap-1 rounded-lg",
            <>
              <span className="text-[11px] font-medium uppercase tracking-wider opacity-70">{WEEKDAY_NAMES[dow(t)]}</span>
              <span className="text-[1.25rem] font-semibold leading-none tabular-nums">{new Date(t).getUTCDate()}</span>
            </>,
          ),
        )}
      </div>
    );
  }

  // ---- 30 days: one month calendar, whole weeks ----
  if (span <= 31) {
    const days: number[] = [];
    for (let t = start - dow(start) * DAY; t <= to + (6 - dow(to)) * DAY; t += DAY) days.push(t);
    return (
      <div key={redraw ?? "first"}>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-ink-faint">
          {WEEKDAYS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {days.map((t, i) =>
            day(t, i, edgeOf(i % 7, 7), "flex h-6 items-center justify-center rounded-[5px] text-[11.5px] font-medium tabular-nums", new Date(t).getUTCDate()),
          )}
        </div>
      </div>
    );
  }

  // ---- 3 months: the months it touches, side by side ----
  if (span <= 92) {
    const months: number[] = [];
    for (let d = new Date(start); ; ) {
      const m = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      if (m > to) break;
      months.push(m);
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    }
    let i = 0;
    return (
      <div key={redraw ?? "first"} className="grid gap-4" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(0, 1fr))` }}>
        {months.map((m, mi) => {
          const md = new Date(m);
          const last = Date.UTC(md.getUTCFullYear(), md.getUTCMonth() + 1, 0);
          const cells: Array<number | null> = [...Array(dow(m)).fill(null)];
          for (let t = m; t <= last; t += DAY) cells.push(t);
          return (
            <div key={m} className="min-w-0">
              <p className="mb-2 text-[11.5px] font-medium text-ink-faint">{MONTHS[md.getUTCMonth()]}</p>
              <div className="grid grid-cols-7 gap-[3px]">
                {cells.map((t, k) =>
                  t == null ? (
                    <span key={`p${k}`} aria-hidden="true" />
                  ) : (
                    day(t, i++, edgeOf(mi * 7 + (k % 7), months.length * 7), "block aspect-square rounded-[3px]", null, "bg-surface-2/35")
                  ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ---- 12 months and all time: a column per week ----
  const days: number[] = [];
  for (let t = start - dow(start) * DAY; t <= to + (6 - dow(to)) * DAY; t += DAY) days.push(t);
  const weeks = days.length / 7;
  const gap = weeks > 30 ? 2 : 3;
  // Columns share the full width; a cell is as tall as it is wide, up to
  // 18px (container units: the grid knows its own width).
  const cols = { gridTemplateColumns: `repeat(${weeks}, minmax(0, 1fr))`, columnGap: gap, rowGap: gap };
  const cellH = `min(18px, calc((100cqw - ${(weeks - 1) * gap}px) / ${weeks}))`;
  const labels: Array<{ col: number; text: string }> = [];
  for (let w = 0; w < weeks; w++) {
    const m = new Date(days[w * 7 + 6]).getUTCMonth();
    const prev = w === 0 ? -1 : new Date(days[(w - 1) * 7 + 6]).getUTCMonth();
    if (m !== prev && (labels.length === 0 || w - labels[labels.length - 1].col >= 3)) labels.push({ col: w, text: MONTHS[m] });
  }
  return (
    <div key={redraw ?? "first"} className="@container">
      <div className="grid grid-flow-col grid-rows-7" style={cols}>
        {days.map((t, i) => (
          <span key={t} className="block" style={{ height: cellH }}>
            {day(t, i, edgeOf(Math.floor(i / 7), weeks), cx("block h-full w-full", weeks > 30 ? "rounded-[2px]" : "rounded-[3px]"))}
          </span>
        ))}
      </div>
      <div aria-hidden="true" className="mt-2 grid h-4 text-[11.5px] leading-4 text-ink-faint" style={cols}>
        {labels.map((l) => (
          <span key={l.col} className="whitespace-nowrap" style={{ gridColumnStart: l.col + 1 }}>
            {l.text}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Dates under a chart, HTML so they never stretch with the drawing. */
function Dates({ labels, n, xs }: { labels: Array<{ i: number; text: string }>; n: number; xs: number[] }) {
  return (
    <div className="relative mt-2 h-4 text-[11.5px] leading-4 text-ink-faint" aria-hidden="true">
      {labels.map(({ i, text }) => (
        <span
          key={i}
          className="absolute top-0 whitespace-nowrap"
          style={{
            left: `${(xs[i] / W) * 100}%`,
            transform: i === 0 && n > 1 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)",
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

