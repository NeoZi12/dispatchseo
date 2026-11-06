"use client";

import { useId, useState } from "react";

import { cx, FOCUS_RING } from "@/components/ui/styles";
import { monotonePath, niceMax, TONE_VAR, type Tone } from "./curve";
import { fmt, fullDate, money, shortDate } from "./format";

// The page's interactive charts. One smooth line with a soft fill, the
// previous period as a dashed line behind it, a crosshair and a readout on
// hover (or touch), and nothing else: no axis box, three faint guides.

export type Unit = "int" | "usd";

function show(v: number, unit: Unit): string {
  return unit === "usd" ? money(v) : fmt(v);
}

const W = 1000;

export function AreaChart({
  days,
  values,
  previous,
  unit = "int",
  tone = "blue",
  height = 240,
  label,
  kind = "line",
}: {
  /** line for continuous traffic; bars for sparse daily counts (signups, spend). */
  kind?: "line" | "bars";
  days: string[];
  values: number[];
  previous?: number[];
  unit?: Unit;
  tone?: Tone;
  height?: number;
  /** Names the series in the readout and for screen readers. */
  label: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const n = values.length;
  const H = 300;
  const PAD = 14;
  const max = niceMax(Math.max(0, ...values, ...(previous ?? [])));
  const bars = kind === "bars";
  // Lines run edge to edge; bars sit in n equal slots, so their centres move in.
  const x = (i: number) => (bars ? ((i + 0.5) / Math.max(1, n)) * W : n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const xs = values.map((_, i) => x(i));
  const line = bars ? "" : monotonePath(xs, values.map(y));
  const area = !bars && n ? `${line} L${W},${H} L0,${H} Z` : "";
  const prevLine = previous && previous.length === n ? monotonePath(xs, previous.map(y)) : null;
  const color = TONE_VAR[tone];
  const ticks = Array.from(new Set([0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (n - 1))))).filter((i) => i >= 0);
  const total = values.reduce((a, v) => a + v, 0);

  function pick(clientX: number, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setHover(bars ? Math.min(n - 1, Math.floor(f * n)) : n > 1 ? Math.round(f * (n - 1)) : 0);
  }

  const hx = hover == null ? 0 : (x(hover) / W) * 100;
  const hy = hover == null ? 0 : (y(values[hover]) / H) * 100;

  return (
    <figure className="m-0">
      <div className="relative" style={{ height }}>
        {/* Guides: the floor, the middle, the top, with the scale written small. */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0" style={{ top: `${(PAD + (1 - f) * (H - PAD * 2)) / H * 100}%` }} aria-hidden="true">
            <div className={cx("h-px w-full", f === 0 ? "bg-line" : "bg-line-soft")} />
            {f > 0 ? (
              <span className="absolute -top-[9px] left-0 rounded bg-surface pr-1.5 font-mono text-[10.5px] leading-[18px] tabular-nums text-ink-faint/80">{show(max * f, unit)}</span>
            ) : null}
          </div>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" role="img" aria-label={`${label}: ${show(total, unit)} in total`}>
          <defs>
            <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {prevLine ? (
            <path d={prevLine} fill="none" stroke="var(--color-ink-faint)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          ) : null}
          {area ? <path d={area} fill={`url(#g${gid})`} /> : null}
          {bars
            ? values.map((v, i) => {
                const slot = W / Math.max(1, n);
                const gap = Math.min(slot * 0.22, 10);
                const top = v > 0 ? Math.min(y(v), H - PAD - 3) : H - PAD;
                return v > 0 ? (
                  <rect
                    key={i}
                    x={i * slot + gap / 2}
                    y={top}
                    width={slot - gap}
                    height={H - PAD - top}
                    style={{ fill: color }}
                    opacity={hover == null || hover === i ? 0.9 : 0.4}
                  />
                ) : null;
              })
            : null}
          {line ? <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {hover != null ? (
          <>
            <div className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/40" style={{ left: `${hx}%` }} aria-hidden="true" />
            {bars ? null : (
              <div
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-surface"
                style={{ left: `${hx}%`, top: `${hy}%`, background: color }}
                aria-hidden="true"
              />
            )}
            <div
              className="pointer-events-none absolute top-0 z-10 min-w-[9.5rem] rounded-lg border border-line bg-canvas/95 px-3 py-2 shadow-xl shadow-black/40 backdrop-blur"
              style={{ left: `${hx}%`, transform: `translateX(${hx > 70 ? "calc(-100% - 12px)" : "12px"})` }}
            >
              <p className="text-[11.5px] text-ink-faint">{fullDate(days[hover])}</p>
              <p className="mt-1 flex items-center gap-2 text-[13px]">
                <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden="true" />
                <span className="font-mono font-medium tabular-nums text-ink">{show(values[hover], unit)}</span>
                <span className="text-ink-faint">{label.toLowerCase()}</span>
              </p>
              {previous && previous.length === n ? (
                <p className="mt-0.5 flex items-center gap-2 text-[12px] text-ink-faint">
                  <span className="h-0 w-3 border-t border-dashed border-ink-faint" aria-hidden="true" />
                  <span className="font-mono tabular-nums">{show(previous[hover], unit)}</span>
                  <span>period before</span>
                </p>
              ) : null}
            </div>
          </>
        ) : null}
        <div
          className="absolute inset-0 cursor-crosshair touch-pan-y"
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
          aria-hidden="true"
        />
      </div>
      <div className="relative mt-2 h-4" aria-hidden="true">
        {n > 0
          ? ticks.map((i, j) => (
              <span
                key={i}
                className={cx(
                  "absolute top-0 whitespace-nowrap font-mono text-[10.5px] tabular-nums text-ink-faint",
                  j === 0 ? "" : j === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                  j > 0 && j < ticks.length - 1 && j % 2 === 1 ? "hidden sm:block" : "",
                )}
                style={{ left: `${(x(i) / W) * 100}%` }}
              >
                {shortDate(days[i])}
              </span>
            ))
          : null}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-faint">
        <span className="flex items-center gap-2">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: color }} aria-hidden="true" />
          {days.length ? `${shortDate(days[0])} – ${shortDate(days[days.length - 1])}` : ""}
        </span>
        {prevLine ? (
          <span className="flex items-center gap-2">
            <span className="h-0 w-3.5 border-t border-dashed border-ink-faint" aria-hidden="true" />
            Period before
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

export type ChartMetric = {
  key: string;
  label: string;
  /** The headline figure for the tab, already formatted. */
  total: string;
  delta: number | null;
  values: number[];
  previous?: number[];
  unit?: Unit;
  tone?: Tone;
  kind?: "line" | "bars";
};

function Delta({ value }: { value: number | null }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value > 0.5;
  const down = value < -0.5;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-medium tabular-nums",
        up ? "bg-ok/12 text-ok" : down ? "bg-danger/12 text-danger" : "bg-surface-3 text-ink-faint",
      )}
    >
      {up ? "+" : ""}
      {Math.round(value)}%
    </span>
  );
}

/** Stripe-style metric tabs over one chart: each tab is a figure for the
 *  range; choosing one redraws the chart below it. */
export function MetricChart({ days, metrics, height = 260 }: { days: string[]; metrics: ChartMetric[]; height?: number }) {
  const [key, setKey] = useState(metrics[0]?.key);
  const m = metrics.find((x) => x.key === key) ?? metrics[0];
  if (!m) return null;
  return (
    <div>
      <div role="tablist" aria-label="Metric" className="grid grid-cols-2 gap-px border-b border-line-soft bg-line-soft lg:grid-cols-4">
        {metrics.map((x) => {
          const on = x.key === m.key;
          return (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setKey(x.key)}
              className={cx("relative bg-surface px-5 py-4 text-left transition-colors hover:bg-surface-2/60 sm:px-6 sm:py-5", on && "bg-surface-2/50", FOCUS_RING)}
            >
              {on ? <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: TONE_VAR[x.tone ?? "blue"] }} aria-hidden="true" /> : null}
              <span className={cx("block text-[13px]", on ? "text-ink" : "text-ink-muted")}>{x.label}</span>
              <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-[1.6rem] font-light leading-none tracking-tight tabular-nums text-ink sm:text-[1.9rem]">{x.total}</span>
                <Delta value={x.delta} />
              </span>
            </button>
          );
        })}
      </div>
      <div className="px-4 pb-5 pt-8 sm:px-6">
        <AreaChart key={m.key} days={days} values={m.values} previous={m.previous} unit={m.unit} tone={m.tone} kind={m.kind} height={height} label={m.label} />
      </div>
    </div>
  );
}
