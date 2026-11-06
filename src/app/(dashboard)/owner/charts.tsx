import { cx } from "@/components/ui/styles";
import type { DayRow } from "@/lib/owner-analytics";
import { compact, fmt, fullDate, pct, shortDate } from "./format";

// Server-rendered SVG charts for /owner. Each bar is its own mark with a
// native <title>, so hovering a day reads its numbers without client JS. The
// SVGs stretch to their box (preserveAspectRatio none) and every label is
// HTML laid over or under them, so text never stretches with the bars.

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const step = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => m <= x) ?? 10;
  return step * p;
}

function Bars({
  days,
  value,
  inner,
  tone,
  innerTone,
  max,
  height,
  title,
}: {
  days: DayRow[];
  value: (d: DayRow) => number;
  inner?: (d: DayRow) => number;
  tone: string;
  innerTone?: string;
  max: number;
  height: number;
  title: (d: DayRow) => string;
}) {
  const n = days.length;
  const unit = 10;
  const gap = n > 60 ? 2 : n > 20 ? 3 : 4;
  return (
    <svg viewBox={`0 0 ${n * unit} 100`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden="true">
      {days.map((d, i) => {
        const v = value(d);
        const h = max ? (v / max) * 100 : 0;
        const iv = inner ? inner(d) : 0;
        const ih = max ? (iv / max) * 100 : 0;
        const x = i * unit + gap / 2;
        const w = unit - gap;
        return (
          <g key={d.day}>
            <title>{title(d)}</title>
            {/* A hit target the full column height, so the tooltip opens on an empty day too. */}
            <rect x={i * unit} y={0} width={unit} height={100} fill="transparent" />
            {v > 0 ? <rect x={x} y={100 - h} width={w} height={h} className={tone} /> : null}
            {inner && iv > 0 ? <rect x={x} y={100 - ih} width={w} height={ih} className={innerTone} /> : null}
          </g>
        );
      })}
    </svg>
  );
}

function YAxis({ max, height }: { max: number; height: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height }} aria-hidden="true">
      {[1, 0.5, 0].map((f) => (
        <div key={f} className="absolute inset-x-0 flex items-center" style={{ top: `${(1 - f) * 100}%` }}>
          <span className="w-9 shrink-0 -translate-y-1/2 pr-2 text-right text-[10.5px] tabular-nums text-ink-faint">{compact(max * f)}</span>
          <span className={cx("h-px flex-1", f === 0 ? "bg-line" : "bg-line-soft")} />
        </div>
      ))}
    </div>
  );
}

function XAxis({ days }: { days: DayRow[] }) {
  const n = days.length;
  const every = n <= 7 ? 1 : n <= 30 ? 5 : 15;
  return (
    <div className="relative mt-1.5 h-4 pl-9" aria-hidden="true">
      {days.map((d, i) =>
        i % every === 0 && (n - i > every / 2 || n <= 7) ? (
          <span
            key={d.day}
            className="absolute top-0 -translate-x-1/2 text-[10.5px] tabular-nums text-ink-faint"
            style={{ left: `calc(2.25rem + ${((i + 0.5) / n) * 100}% - 2.25rem * ${(i + 0.5) / n})` }}
          >
            {shortDate(d.day)}
          </span>
        ) : null,
      )}
    </div>
  );
}

/** Two panels on one time axis: people (page views, with distinct visitors
 *  as the solid inner bar) above crawlers (gray). Separate scales on
 *  purpose - crawlers outnumber people by an order of magnitude on a
 *  small site, and on one scale the people would be a hairline. */
export function TrafficChart({ days }: { days: DayRow[] }) {
  const peopleMax = niceMax(Math.max(0, ...days.map((d) => d.humanViews)));
  const botMax = niceMax(Math.max(0, ...days.map((d) => d.botHits)));
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="text-[13px] font-medium text-ink-muted">People</p>
        <p className="flex items-center gap-4 text-[12px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ok" aria-hidden="true" /> Visitors
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-ok/30" aria-hidden="true" /> Page views
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-surface-3" aria-hidden="true" /> Crawler hits
          </span>
        </p>
      </div>
      <div className="relative mt-3">
        <YAxis max={peopleMax} height={168} />
        <div className="pl-9">
          <Bars
            days={days}
            value={(d) => d.humanViews}
            inner={(d) => d.humanVisitors}
            tone="fill-ok/30"
            innerTone="fill-ok"
            max={peopleMax}
            height={168}
            title={(d) => `${fullDate(d.day)}\n${fmt(d.humanVisitors)} visitors · ${fmt(d.humanViews)} page views\n${fmt(d.botHits)} crawler hits · ${fmt(d.browserHits)} browser requests`}
          />
        </div>
      </div>
      <p className="mt-4 text-[13px] font-medium text-ink-muted">Crawlers</p>
      <div className="relative mt-3">
        <YAxis max={botMax} height={72} />
        <div className="pl-9">
          <Bars
            days={days}
            value={(d) => d.botHits}
            tone="fill-surface-3"
            max={botMax}
            height={72}
            title={(d) => `${fullDate(d.day)}\n${fmt(d.botHits)} crawler hits`}
          />
        </div>
      </div>
      <XAxis days={days} />
    </div>
  );
}

/** One bar, three kinds of request: people (ran our script), browsers that
 *  never did (headless tools, blocked scripts, bounced before load), and
 *  declared crawlers. The answer to "how many of them are bots". */
export function ShareBar({ people, unconfirmed, bots }: { people: number; unconfirmed: number; bots: number }) {
  const total = people + unconfirmed + bots;
  const segs = [
    { label: "People", n: people, cls: "bg-ok" },
    { label: "Unconfirmed browsers", n: unconfirmed, cls: "bg-ink-faint/45" },
    { label: "Crawlers", n: bots, cls: "bg-surface-3" },
  ];
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2" role="img" aria-label={segs.map((s) => `${s.label} ${pct(s.n, total)}`).join(", ")}>
        {segs.map((s) =>
          s.n > 0 ? <div key={s.label} className={s.cls} style={{ width: `${(s.n / total) * 100}%` }} title={`${s.label}: ${fmt(s.n)} (${pct(s.n, total)})`} /> : null,
        )}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-4">
        {segs.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[12px] text-ink-faint">
              <span className={cx("h-2 w-2 shrink-0 rounded-sm", s.cls)} aria-hidden="true" />
              <span className="truncate">{s.label}</span>
            </dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="text-[17px] font-semibold tabular-nums text-ink">{pct(s.n, total)}</span>
              <span className="text-[12px] tabular-nums text-ink-faint">{fmt(s.n)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Horizontal funnel: each step's bar against the first, the conversion from
 *  the step before it on the right. */
export function Funnel({ steps }: { steps: Array<{ label: string; count: number; note?: string }> }) {
  const first = steps[0]?.count ?? 0;
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].count : null;
        const w = first ? Math.max(s.count > 0 ? 1.5 : 0, (s.count / first) * 100) : 0;
        return (
          <li key={s.label} className="grid grid-cols-[minmax(0,11rem)_1fr_4.5rem] items-center gap-x-4 sm:grid-cols-[minmax(0,13rem)_1fr_5rem]">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-medium text-ink">{s.label}</p>
              {s.note ? <p className="truncate text-[11.5px] text-ink-faint">{s.note}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-surface-2">
                <div className={cx("h-full rounded-md", i === 0 ? "bg-ok" : "bg-ok/55")} style={{ width: `${w}%` }} />
              </div>
              <span className="w-12 shrink-0 text-right text-[15px] font-semibold tabular-nums text-ink">{fmt(s.count)}</span>
            </div>
            <span className="text-right text-[12.5px] tabular-nums text-ink-faint">{prev == null ? "" : prev ? pct(s.count, prev) : "–"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** One cell per day, violet by how many articles went live. Up to five
 *  weeks it is one row; past that, a weeks-by-weekdays grid (columns are
 *  weeks, rows Sunday to Saturday), so 90 days stay legible. */
export function PublishStrip({ days }: { days: Array<{ day: string; count: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const n = days.length;
  const grid = n > 35;
  // Pad the first week so weekday rows line up when gridded.
  const lead = grid ? new Date(days[0].day).getUTCDay() : 0;
  const cols = grid ? Math.ceil((n + lead) / 7) : n;
  const cell = (d: { day: string; count: number }) => (
    <div
      key={d.day}
      title={`${fullDate(d.day)}: ${d.count} ${d.count === 1 ? "article" : "articles"}`}
      className={cx("aspect-square rounded-[3px]", d.count ? "bg-accent" : "bg-surface-2")}
      style={d.count ? { opacity: 0.3 + (d.count / max) * 0.7 } : undefined}
    />
  );
  return (
    <div
      className="grid gap-[3px]"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, ${grid ? "1fr" : "28px"}))`,
        gridAutoFlow: grid ? "column" : "row",
        gridTemplateRows: grid ? "repeat(7, minmax(0, 1fr))" : undefined,
        justifyContent: grid ? undefined : "space-between",
      }}
      role="img"
      aria-label="Articles published per day"
    >
      {Array.from({ length: lead }, (_, i) => (
        <div key={`lead-${i}`} aria-hidden="true" />
      ))}
      {days.map(cell)}
    </div>
  );
}

/** Paired bars per customer: what they pay for the range (green) against
 *  what their sites cost in it (gray), on one scale. */
export function MoneyBars({ rows }: { rows: Array<{ label: string; sub?: string; revenue: number; cost: number }> }) {
  const max = Math.max(0.01, ...rows.flatMap((r) => [r.revenue, r.cost]));
  return (
    <ol className="space-y-3.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-x-4 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-medium text-ink" title={r.label}>
              {r.label}
            </p>
            {r.sub ? <p className="truncate text-[11.5px] text-ink-faint">{r.sub}</p> : null}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                <div className="h-full rounded-sm bg-ok" style={{ width: `${(r.revenue / max) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-[12.5px] font-medium tabular-nums text-ok">{r.revenue ? `$${r.revenue.toFixed(2)}` : "$0"}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-sm bg-surface-2">
                <div className="h-full rounded-sm bg-ink-faint/50" style={{ width: `${(r.cost / max) * 100}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-[12.5px] tabular-nums text-ink-muted">{r.cost ? `$${r.cost.toFixed(2)}` : "$0"}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
