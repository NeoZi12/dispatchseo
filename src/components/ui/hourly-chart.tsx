"use client";

import { useEffect, useId, useState } from "react";
import { cx } from "./styles";

// One day on Google, hour by hour (the day page, dashboard/period): people
// as green bars in front, times seen as a soft blue area behind them, each
// on its own scale - impressions run in the hundreds where clicks stay in
// single figures, so one shared axis would flatten the bars to nothing.
// Hover (or tap) an hour for both numbers. The busiest hour for people is
// the bright bar.
//
// Hours arrive as ISO times with Google's Pacific offset and are labelled
// in the viewer's own time zone. That label needs the browser, so the
// server renders "" and the labels fill in after mount (no hydration
// mismatch, no flash of Pacific times).
//
// Hand-rolled like overview-chart.tsx: the repo bans chart libraries. The
// area is SVG stretched with preserveAspectRatio="none"; bars, labels and
// the readout are HTML laid over it by percentage.

/** pending: not reported yet (today's later hours) - an empty slot. */
export type HourPoint = { at: string; clicks: number; impressions: number; pending?: boolean };

const W = 240;
const H = 100;
const css = (v: Record<string, string | number>) => v as React.CSSProperties;

function hourLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric" });
}

export function HourlyChart({ hours }: { hours: HourPoint[] }) {
  const gradient = useId();
  const [labels, setLabels] = useState<string[] | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => setLabels(hours.map((h) => hourLabel(h.at))), [hours]);

  const n = hours.length;
  const maxC = Math.max(1, ...hours.map((h) => h.clicks));
  const maxI = Math.max(1, ...hours.map((h) => h.impressions));
  const best = hours.reduce((b, h, i) => (h.clicks > hours[b].clicks ? i : b), 0);
  const hasClicks = hours.some((h) => h.clicks > 0);
  // The impressions area runs through each bar's centre.
  const x = (i: number) => ((i + 0.5) / n) * W;
  const y = (v: number) => H - (v / maxI) * (H - 6);
  // The line stops at the last reported hour; pending slots have no reading.
  const last = hours.reduce((m, h, i) => (h.pending ? m : i), -1);
  const line = hours
    .slice(0, last + 1)
    .map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(h.impressions).toFixed(2)}`)
    .join(" ");
  const area = last >= 0 ? `${line} L${x(last).toFixed(2)},${H} L${x(0).toFixed(2)},${H} Z` : "";
  const anyPending = hours.some((h) => h.pending);
  const h = hover != null ? hours[hover] : null;

  return (
    <div className="rounded-2xl border border-line-soft bg-surface px-4 pb-4 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px] bg-ok" />
            People from Google
          </span>
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-3.5 rounded-full bg-info" />
            Times you showed up
          </span>
        </p>
        {/* The readout: the hovered hour, else the busiest one. */}
        <p className="text-[13px] text-ink-faint tabular-nums" aria-live="polite">
          {h && labels ? (
            <>
              <span className="font-medium text-ink">{labels[hover!]}</span>
              <span aria-hidden="true"> · </span>
              <span className="text-ink">{h.clicks}</span> {h.clicks === 1 ? "person" : "people"}
              <span aria-hidden="true"> · </span>
              <span className="text-ink">{h.impressions.toLocaleString("en-US")}</span> times seen
            </>
          ) : hasClicks && labels ? (
            <>
              Busiest hour <span className="font-medium text-ink">{labels[best]}</span>, {hours[best].clicks} {hours[best].clicks === 1 ? "person" : "people"}
            </>
          ) : (
            <span>&nbsp;</span>
          )}
        </p>
      </div>

      <div className="relative mt-5 h-52 sm:h-60" onPointerLeave={() => setHover(null)}>
        {/* Times seen: a soft area behind everything, on its own scale. */}
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-info)" stopOpacity="0.18" />
              <stop offset="100%" stopColor="var(--color-info)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gradient})`} className="arrive-in" style={css({ "--at": "320ms" })} />
          <path
            d={line}
            fill="none"
            stroke="var(--color-info)"
            strokeOpacity="0.7"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="arrive-wipe"
            style={css({ "--at": "260ms" })}
          />
        </svg>
        {/* People: a bar per hour, the busiest one bright. Each column is
            the hover target for its hour. */}
        <ol className="absolute inset-0 flex items-end gap-[3px] sm:gap-1.5">
          {hours.map((p, i) => {
            const on = hover === i;
            const top = hasClicks && i === best;
            return (
              <li
                key={p.at}
                className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center"
                onPointerEnter={() => setHover(p.pending ? null : i)}
                onPointerDown={() => setHover(p.pending ? null : i)}
              >
                {on ? <span aria-hidden="true" className="absolute inset-0 rounded-md bg-ink/[0.04]" /> : null}
                {p.pending ? (
                  // Not in yet: a faint empty slot, not a zero.
                  <span aria-hidden="true" className="block h-full w-full max-w-[22px] rounded-[5px] border border-dashed border-line/70" />
                ) : (
                  <span
                    className={cx(
                      "arrive-rise relative block w-full max-w-[22px] rounded-t-[5px] transition-colors duration-150",
                      p.clicks === 0 ? "bg-line" : top || on ? "bg-ok" : "bg-ok/45",
                    )}
                    style={css({ height: p.clicks === 0 ? "2px" : `${Math.max(4, (p.clicks / maxC) * 92)}%`, "--at": "200ms", "--i": i, "--step": "18ms" })}
                  />
                )}
                <span className="sr-only">
                  {labels?.[i] ?? ""}: {p.pending ? "not reported yet" : `${p.clicks} ${p.clicks === 1 ? "person" : "people"}, ${p.impressions} times seen`}
                </span>
              </li>
            );
          })}
        </ol>
        {/* The impressions dot on the hovered hour. */}
        {h ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-info"
            style={{ left: `${(x(hover!) / W) * 100}%`, top: `${(y(h.impressions) / H) * 100}%` }}
          />
        ) : null}
      </div>

      {/* Every third hour named, in the viewer's time. */}
      <div aria-hidden="true" className="mt-2 flex gap-[3px] sm:gap-1.5">
        {hours.map((p, i) => (
          <span key={p.at} className="min-w-0 flex-1 text-center text-[11px] text-ink-faint tabular-nums">
            {labels && i % 3 === 0 ? labels[i] : " "}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] text-ink-faint">
        Times in your time zone. Google counts its days on Pacific time
        {anyPending ? ", and the dashed hours aren't in yet - they fill in on their own through the day." : ", and its last few hours can still move a little as it finalizes them."}
      </p>
    </div>
  );
}
