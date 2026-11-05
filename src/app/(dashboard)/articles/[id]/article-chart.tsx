"use client";

import { useState } from "react";
import { unpackDays } from "@/components/ui/overview-pack";
import { cx, FOCUS_RING } from "@/components/ui/styles";

// One article, day by day, from the day it was published (owner,
// 2026-11-05: start when the article came out, fewer colours, to the point).
// One chart, one colour, one switch: clicks and times shown as daily bars,
// its spot on Google as a line with the best spot at the top. Hovering a day
// gives all three numbers for it, whichever is switched on. Hand-rolled SVG:
// the repo bans chart libraries; anything that must not stretch is HTML.

type Metric = "clicks" | "impressions" | "position";
const METRICS: { key: Metric; label: string }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "impressions", label: "Times shown" },
  { key: "position", label: "Spot on Google" },
];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const W = 1000;
const H = 220;

function short(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
const num = (n: number) => n.toLocaleString("en-US");
const spot = (p: number | null | undefined) => (p == null ? "-" : `#${Math.max(1, Math.round(p))}`);

function ticks(n: number, want: number): number[] {
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  const step = (n - 1) / (want - 1);
  return Array.from({ length: want }, (_, i) => Math.round(i * step));
}

export function ArticleChart({ daily }: { daily: string }) {
  const days = unpackDays(daily);
  const [metric, setMetric] = useState<Metric>("clicks");
  const [hover, setHover] = useState<number | null>(null);
  const n = days.length;
  if (!n) return null;

  const slot = W / n;
  const xMid = (i: number) => slot * i + slot / 2;
  const bars = metric !== "position";
  const vals = days.map((d) => (metric === "position" ? d.position : d[metric]));
  const present = vals.filter((v): v is number => v != null);
  const hi = present.length ? Math.max(...present) : 0;
  const lo = present.length ? Math.min(...present) : 0;
  const top = bars ? Math.max(1, hi) : 0;
  // Spot: lower is better, so the best spot sits at the top.
  const yPos = (p: number) => 12 + ((p - lo) / Math.max(hi - lo, 1)) * (H - 24);

  let line = "";
  if (!bars) {
    let open = false;
    days.forEach((d, i) => {
      if (d.position == null) {
        open = false;
        return;
      }
      line += `${open ? "L" : "M"}${xMid(i).toFixed(1)},${yPos(d.position).toFixed(1)} `;
      open = true;
    });
  }
  const tk = ticks(n, 6);
  const h = hover != null ? days[hover] : null;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))));
  }

  const empty = !present.length || (bars && hi === 0);

  return (
    <section aria-labelledby="chart-title" className="arrive-up rounded-2xl border border-line-soft bg-surface p-5 sm:p-6" style={{ "--at": "320ms" } as React.CSSProperties}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="chart-title" className="text-[15px] font-semibold text-ink">
          Day by day <span className="font-normal text-ink-faint">since it was published on {short(days[0].date)}</span>
        </h3>
        <div role="group" aria-label="What the chart shows" className="flex rounded-lg border border-line-soft bg-surface-2 p-0.5">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              aria-pressed={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={cx(
                "rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors",
                metric === m.key ? "bg-surface-3 text-ink shadow-sm" : "text-ink-muted hover:text-ink",
                FOCUS_RING,
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 flex gap-3">
        {/* The scale: top and bottom only, which is all a reader needs. */}
        <div aria-hidden="true" className="flex h-56 w-9 shrink-0 flex-col justify-between text-right text-[11.5px] tabular-nums text-ink-faint">
          <span>{empty ? "" : bars ? num(top) : spot(lo)}</span>
          <span>{empty ? "" : bars ? "0" : spot(hi)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative h-56 touch-none select-none" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
            <span aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-line-soft" />
            <span aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-soft" />
            <span aria-hidden="true" className="absolute inset-x-0 bottom-0 border-t border-line" />
            {empty ? (
              <p className="absolute inset-0 flex items-center justify-center text-[13.5px] text-ink-muted">
                {metric === "clicks" ? "No clicks yet." : "Not shown on Google yet."}
              </p>
            ) : (
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                {bars
                  ? vals.map((v, i) =>
                      v ? (
                        <rect
                          key={`${metric}${i}`}
                          x={slot * i + slot * 0.15}
                          width={Math.max(slot * 0.7, 1)}
                          y={H - (v / top) * H}
                          height={(v / top) * H}
                          rx={Math.min(3, slot * 0.2)}
                          className={cx("fill-accent transition-opacity", hover != null && hover !== i ? "opacity-45" : "opacity-90")}
                        />
                      ) : null,
                    )
                  : (
                    <path d={line} fill="none" className="stroke-accent" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  )}
              </svg>
            )}
            {h != null && hover != null ? (
              <>
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/50" style={{ left: `${(xMid(hover) / W) * 100}%` }} />
                <div
                  className="pointer-events-none absolute -top-2 z-10 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] shadow-xl shadow-black/40"
                  style={{
                    left: `${(xMid(hover) / W) * 100}%`,
                    transform: hover / n > 0.7 ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
                  }}
                >
                  <p className="text-ink-faint">{short(h.date)}</p>
                  <p className="mt-1 tabular-nums text-ink">
                    <span className={metric === "clicks" ? "font-semibold" : ""}>{num(h.clicks)} {h.clicks === 1 ? "click" : "clicks"}</span>
                    <span className="text-ink-faint"> · </span>
                    <span className={metric === "impressions" ? "font-semibold" : ""}>shown {num(h.impressions)}</span>
                    <span className="text-ink-faint"> · </span>
                    <span className={metric === "position" ? "font-semibold" : ""}>spot {spot(h.position)}</span>
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <div aria-hidden="true" className="relative mt-2 h-4 text-[11.5px] text-ink-faint">
            {tk.map((i, k) => (
              <span
                key={i}
                className="absolute whitespace-nowrap"
                style={{ left: `${(xMid(i) / W) * 100}%`, transform: k === 0 ? "translateX(-4px)" : k === tk.length - 1 ? "translateX(calc(-100% + 4px))" : "translateX(-50%)" }}
              >
                {short(days[i].date)}
                {k === 0 ? " · published" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
