"use client";

// The search-traffic chart, reworked for legibility: labeled dashed gridlines
// (clicks scale on the left, impressions on the right), sparse date ticks,
// smooth monotone-cubic curves, and a hover crosshair + tooltip showing the
// exact numbers for the nearest day. Hand-rolled SVG - this repo bans chart
// libraries (docs/SPEC.md). Client component for the hover state and the
// date-range selector (callers pass the FULL daily history; windowing is
// local state, same as the glance tiles).

import { useId, useState } from "react";
import type { GscRow } from "@/lib/metrics";
import { RangeSelector } from "./range-selector";

// Same windows as the glance tiles, minus 24 hours: GSC rows are daily, so a
// 24-hour "line" would be a single point - the glance tiles already cover the
// live day from Google's fresh hourly feed. No faked hourly series here.
const RANGES = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "all time", days: null },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

// Windows anchor to the most recent date that HAS data, not today - GSC's
// daily data lags 2-3 days (same rule as glance-stats).
function windowRows(daily: GscRow[], days: number | null): GscRow[] {
  if (days == null || daily.length === 0) return daily;
  const latest = daily[daily.length - 1].date;
  const cutoffMs = new Date(latest + "T00:00:00Z").getTime() - (days - 1) * 86400000;
  const cutoff = new Date(cutoffMs).toISOString().slice(0, 10);
  return daily.filter((r) => r.date >= cutoff);
}

const W = 800;
const H = 280;
const PAD = { t: 16, r: 48, b: 28, l: 40 };
const INNER_W = W - PAD.l - PAD.r;
const INNER_H = H - PAD.t - PAD.b;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Deterministic UTC date label ("Jun 8") - no locale, no hydration drift.
function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Round a raw step up to a "nice" 1/2/5 * 10^k value.
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

// Monotone cubic (Fritsch-Carlson) tangents: smooth like the reference chart
// but never overshooting above/below the actual data.
function monotoneTangents(ys: number[], dx: number): number[] {
  const n = ys.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / dx);
  const m = new Array<number>(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / d[i];
      const b = m[i + 1] / d[i];
      const s = a * a + b * b;
      if (s > 9) {
        const t = 3 / Math.sqrt(s);
        m[i] = t * a * d[i];
        m[i + 1] = t * b * d[i];
      }
    }
  }
  return m;
}

function curvePath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n === 0) return "";
  if (n === 1) return `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  const dx = xs[1] - xs[0];
  const m = monotoneTangents(ys, dx);
  let p = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const c1x = xs[i] + dx / 3;
    const c1y = ys[i] + (m[i] * dx) / 3;
    const c2x = xs[i + 1] - dx / 3;
    const c2y = ys[i + 1] - (m[i + 1] * dx) / 3;
    p += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return p;
}

export function GscChart({ rows: allRows }: { rows: GscRow[] }) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<RangeKey>("30d");
  const active = RANGES.find((r) => r.key === range) ?? RANGES[1];
  const rows = windowRows(allRows, active.days);
  const n = rows.length;

  // Headline totals for the window - the big numbers double as the legend
  // (the color dot on each label ties it to its line). BigStatTile scale.
  const totalClicks = rows.reduce((a, r) => a + (r.clicks ?? 0), 0);
  const totalImprs = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-emerald-400" aria-hidden="true" />
            visitors (clicks)
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {totalClicks.toLocaleString("en-US")}
          </p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-neutral-400">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-sky-400/70" aria-hidden="true" />
            impressions
          </p>
          <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {totalImprs.toLocaleString("en-US")}
          </p>
        </div>
      </div>
      <RangeSelector
        options={RANGES}
        active={active.key}
        onChange={(k) => {
          setRange(k as RangeKey);
          setHover(null);
        }}
        className="bg-neutral-950/60"
      />
    </div>
  );

  if (n < 2) {
    return (
      <section className="rounded-xl bg-neutral-900 p-4 sm:p-6">
        {header}
        <div className="mt-4 flex h-40 items-center justify-center rounded-lg bg-neutral-950/60 text-sm text-neutral-400 sm:h-48">
          {allRows.length < 2
            ? "No search traffic to chart yet - Google's Search Console reports run about 2-3 days behind, and your pages need to appear in results first. The graph fills in on its own from here; nothing to do."
            : "Not enough days in this window - pick a longer range."}
        </div>
      </section>
    );
  }

  const clicks = rows.map((r) => r.clicks ?? 0);
  const imprs = rows.map((r) => r.impressions ?? 0);

  // Shared gridlines: size the impressions scale first (the dominant series),
  // then give clicks its own nice scale over the SAME number of intervals so
  // one set of lines carries both axes (clicks labels left, impressions right).
  const imprStep = niceStep(Math.max(...imprs, 1) / 3);
  const intervals = Math.max(1, Math.ceil(Math.max(...imprs, 1) / imprStep));
  const imprTop = imprStep * intervals;
  const clickStep = niceStep(Math.max(...clicks, 1) / intervals);
  const clickTop = clickStep * intervals;

  const x = (i: number) => PAD.l + (i * INNER_W) / (n - 1);
  const yImpr = (v: number) => PAD.t + (1 - v / imprTop) * INNER_H;
  const yClick = (v: number) => PAD.t + (1 - v / clickTop) * INNER_H;

  const xs = rows.map((_, i) => x(i));
  const imprPath = curvePath(xs, imprs.map(yImpr));
  const clickPath = curvePath(xs, clicks.map(yClick));
  const areaPath = `${imprPath} L${x(n - 1).toFixed(1)},${(H - PAD.b).toFixed(1)} L${PAD.l.toFixed(1)},${(H - PAD.b).toFixed(1)} Z`;

  // ~6 sparse date ticks, always including the first and last day.
  const tickStep = Math.max(1, Math.round((n - 1) / 5));
  const dateTicks: number[] = [];
  for (let i = 0; i < n - 1; i += tickStep) dateTicks.push(i);
  if (n - 1 - (dateTicks[dateTicks.length - 1] ?? 0) < tickStep / 2) dateTicks.pop();
  dateTicks.push(n - 1);

  const gridLevels = Array.from({ length: intervals + 1 }, (_, i) => i);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round((fx - PAD.l) / (INNER_W / (n - 1)));
    setHover(Math.max(0, Math.min(n - 1, idx)));
  }

  const hoverX = hover != null ? x(hover) : 0;
  // Tooltip anchoring: centered on the day, flipped near either edge so it
  // never clips out of the card.
  const hoverFrac = hoverX / W;
  const tooltipTransform =
    hoverFrac > 0.8 ? "translateX(calc(-100% - 10px))" : hoverFrac < 0.14 ? "translateX(10px)" : "translateX(-50%)";

  return (
    <section className="rounded-xl bg-neutral-900 p-4 sm:p-6">
      {header}
      <div className="relative mt-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none"
          role="img"
          aria-label={`Clicks and impressions over the last ${n} days`}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* gridlines + dual axis labels */}
          {gridLevels.map((lvl) => {
            const y = PAD.t + (1 - lvl / intervals) * INNER_H;
            return (
              <g key={lvl}>
                <line
                  x1={PAD.l}
                  x2={W - PAD.r}
                  y1={y}
                  y2={y}
                  stroke="#404040"
                  strokeWidth="1"
                  strokeDasharray="3 5"
                  opacity="0.55"
                />
                <text
                  x={PAD.l - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  fontSize="11"
                  fill="#34d399"
                  opacity="0.75"
                  fontFamily="var(--font-geist-mono)"
                >
                  {clickStep * lvl}
                </text>
                <text
                  x={W - PAD.r + 8}
                  y={y + 3.5}
                  textAnchor="start"
                  fontSize="11"
                  fill="#38bdf8"
                  opacity="0.75"
                  fontFamily="var(--font-geist-mono)"
                >
                  {imprStep * lvl}
                </text>
              </g>
            );
          })}

          {/* x-axis date ticks */}
          {dateTicks.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
              fontSize="11"
              fill="#737373"
              fontFamily="var(--font-geist-mono)"
            >
              {dayLabel(rows[i].date)}
            </text>
          ))}

          {/* impressions: gradient area + line */}
          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={imprPath}
            fill="none"
            strokeWidth="1.5"
            className="stroke-sky-400/70"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* clicks line */}
          <path
            d={clickPath}
            fill="none"
            strokeWidth="2"
            className="stroke-emerald-400"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* hover crosshair + dots */}
          {hover != null ? (
            <g>
              <line
                x1={hoverX}
                x2={hoverX}
                y1={PAD.t}
                y2={H - PAD.b}
                stroke="#a3a3a3"
                strokeWidth="1"
                strokeDasharray="2 3"
                opacity="0.6"
              />
              <circle cx={hoverX} cy={yImpr(imprs[hover])} r="4" className="fill-sky-400" />
              <circle
                cx={hoverX}
                cy={yImpr(imprs[hover])}
                r="7"
                className="fill-sky-400/20"
              />
              <circle cx={hoverX} cy={yClick(clicks[hover])} r="4" className="fill-emerald-400" />
              <circle
                cx={hoverX}
                cy={yClick(clicks[hover])}
                r="7"
                className="fill-emerald-400/20"
              />
            </g>
          ) : null}
        </svg>

        {/* tooltip (HTML, positioned by the day's fraction of the width) */}
        {hover != null ? (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-lg border border-neutral-800 bg-neutral-900/95 px-3 py-2 shadow-xl"
            style={{ left: `${hoverFrac * 100}%`, transform: tooltipTransform }}
          >
            <p className="font-mono text-[11px] font-semibold text-neutral-200">
              {dayLabel(rows[hover].date)}
            </p>
            <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-300">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-emerald-400" aria-hidden="true" />
              {clicks[hover]} click{clicks[hover] === 1 ? "" : "s"}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-xs text-neutral-300">
              <span className="inline-block h-2 w-2 rounded-[2px] bg-sky-400/80" aria-hidden="true" />
              {imprs[hover]} impression{imprs[hover] === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
