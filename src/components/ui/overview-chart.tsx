"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CountUp } from "./count-up";
import { unpackDays } from "./overview-pack";
import { cx, FOCUS_RING } from "./styles";

// The overview: the first thing on Home and on Results, shaped like Polar's
// (and PaperBot's admin, which borrowed it first). One card. A quiet label,
// a big number, the period it covers, then a tall chart of that number;
// under it the card splits in two along a hairline, each half the same
// shape smaller. One series per chart, each in its own colour (people green,
// times seen blue, articles violet) carried by its line, its dots and the
// ring in its period line - so no legend, and no y-axis: the number above
// says the total and hovering says the day.
//
// The drawing is SVG stretched with preserveAspectRatio="none"; anything
// that must not stretch (dates, dots, gridlines, the hover readout) is HTML
// laid over it by percentage. Hand-rolled: the repo bans chart libraries.
//
// It builds itself on first load (globals.css "Arrival"): gridlines fade
// in, the line wipes in left to right with the fill settling in behind it,
// the bars rise one after another, the numbers count up. A range switch
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
  // Articles get coarser buckets than traffic: a month of daily bars would
  // be thirty dashes and one bar.
  const aSize = span > 400 ? 30 : span > 35 ? 7 : 1;
  const aBuckets = bucketize(from, to, aSize);
  for (const p of published) {
    const t = ms(p.at);
    const i = aBuckets.findIndex((b) => t >= b.start && t <= b.end);
    if (i >= 0) {
      aBuckets[i].articles += 1;
      aBuckets[i].live.push(p);
    }
  }

  const clicks = buckets.reduce((s, b) => s + b.clicks, 0);
  const impressions = buckets.reduce((s, b) => s + b.impressions, 0);
  const newInRange = aBuckets.reduce((s, b) => s + b.articles, 0);
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
          <Head
            label="Articles live"
            value={
              <>
                <CountUp value={published.length} />
                {publishedCapped ? "+" : null}
              </>
            }
            when={newInRange ? `${newInRange} went live in this range` : "None went live in this range"}
            tone="accent"
          />
          <div className="mt-5">
            <Bars buckets={aBuckets} size={aSize} redraw={switched ? range : null} />
          </div>
        </div>
        )}
      </div>
    </section>
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
            </span>
          </>
        ) : null}
      </div>
      <Dates labels={tk.map((i) => ({ i, text: size === 30 ? bucketLabel(buckets[i], size) : short(buckets[i].start) }))} n={n} xs={xs} />
    </div>
  );
}

/** Articles that went live per period: bars rising one after another, an
 *  empty period a short dash (zero is a value, not a gap). */
function Bars({ buckets, size, redraw }: { buckets: Bucket[]; size: number; redraw: string | null }) {
  const router = useRouter();
  // The same hover as the lines: which bar, whether shown (a 120ms fade),
  // whether to glide there (not on the first move after entering).
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [glide, setGlide] = useState(false);
  const n = buckets.length;
  const max = Math.max(1, ...buckets.map((b) => b.articles));
  const tk = ticks(n, 3);
  const slot = 100 / n;
  const xs = buckets.map((_, i) => ((i + 0.5) * W) / n);
  const point = (i: number) => {
    setHover(i);
    setGlide(shown);
    setShown(true);
  };
  const said = (b: Bucket) => {
    const titles = b.live.slice(0, 3).map((a) => a.title);
    const more = b.live.length - titles.length;
    return `${bucketLabel(b, size)}: ${titles.join("; ")}${more > 0 ? `; and ${more} more` : ""}`;
  };
  const go = (b: Bucket) => {
    const href = b.live.find((a) => a.href)?.href;
    if (href) router.push(href);
  };
  const motion: React.CSSProperties = {
    transition: glide ? "left 160ms var(--ease-out-expo), transform 160ms var(--ease-out-expo), opacity 120ms ease-out" : "opacity 120ms ease-out",
    opacity: shown ? 1 : 0,
  };
  const hb = hover != null && hover < n ? buckets[hover] : null;
  const frac = hover != null && n > 1 ? hover / (n - 1) : 0.5;

  return (
    <div>
      <div className="relative" onPointerLeave={() => setShown(false)}>
        {/* A faint baseline; a period with nothing live is just that. */}
        <div className="relative flex h-24 items-end border-b border-line" key={redraw ?? "first"}>
          {buckets.map((b, i) => {
            const on = hover === i && shown;
            const dim = shown && hover !== i;
            return (
              <div
                key={b.start}
                className="flex h-full items-end justify-center"
                style={{ width: `${slot}%` }}
                onPointerEnter={b.articles ? () => point(i) : undefined}
              >
                {b.articles ? (
                  <span
                    role="link"
                    tabIndex={0}
                    aria-label={said(b)}
                    onFocus={() => point(i)}
                    onBlur={() => setShown(false)}
                    onClick={() => go(b)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") go(b);
                    }}
                    // Width follows the period: chunky on a week of days,
                    // thin across a year of weeks.
                    className={cx(
                      "arrive-rise block w-[60%] max-w-9 min-w-[3px] cursor-pointer rounded-t-md bg-accent outline-none transition-[opacity,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                      on ? "shadow-[0_0_16px_2px_rgb(167_139_250/0.55)]" : "",
                      dim ? "opacity-55" : "",
                    )}
                    style={css({
                      height: `${Math.max(12, (b.articles / max) * 100)}%`,
                      "--at": redraw ? "0ms" : "820ms",
                      "--i": i,
                      "--step": `${Math.max(8, Math.round(400 / n))}ms`,
                    })}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {hb && hb.live.length ? (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-2 max-w-[18rem] rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] shadow-xl shadow-black/40 motion-reduce:transition-none!"
            style={{
              ...motion,
              left: `${(xs[hover!] / W) * 100}%`,
              transform: frac > 0.7 ? "translateX(calc(-100% + 12px))" : frac < 0.3 ? "translateX(-12px)" : "translateX(-50%)",
            }}
          >
            <span className="block text-ink-faint">
              {bucketLabel(hb, size)}
              {hb.live.length > 1 ? `, ${hb.live.length} articles` : ""}
            </span>
            {hb.live.slice(0, 3).map((a, k) => (
              <span key={k} className="mt-0.5 block truncate text-ink">
                {a.title}
              </span>
            ))}
            {hb.live.length > 3 ? <span className="mt-0.5 block text-ink-muted">+{hb.live.length - 3} more</span> : null}
          </div>
        ) : null}
      </div>
      <Dates labels={tk.map((i) => ({ i, text: size === 30 ? bucketLabel(buckets[i], size) : short(buckets[i].start) }))} n={n} xs={xs} />
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

