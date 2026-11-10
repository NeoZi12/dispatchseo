"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { CountUp } from "./count-up";
import { curve, ticks } from "./overview-chart";
import { cx } from "./styles";

// A stretch on Google point by point (the period page, dashboard/period):
// one day hour by hour, or a week / month day by day - drawn exactly like
// the overview chart on Home (overview-chart.tsx, owner
// 2026-11-10: "the same beautiful graph"): one card, the two totals as its
// head, then one chart with two smooth lines - people from Google green,
// times you showed up blue - each on its own scale (impressions run in the
// thousands where clicks stay small, so one shared axis would flatten the
// green to nothing). Soft gradient fills, dashed guides at the labelled
// times, and on hover a guide line, a dot on each line and the readout box:
// the hour, people, impressions.
//
// Hours arrive as ISO times with Google's Pacific offset and are labelled in
// the viewer's own time zone - that needs the browser, so labels fill in
// after mount. Days are Google's own dates and are labelled as they are.
// Points Google hasn't reported yet (later today, the last 2-3 days) are not
// drawn at all: the lines stop at the last reported one. A point with an
// href opens on click (a week's day -> that day's page); a finger's first
// tap shows the readout, a second tap on the same point opens it.
//
// Hand-rolled like overview-chart.tsx (the repo bans chart libraries): SVG
// stretched with preserveAspectRatio="none", everything that must not
// stretch (labels, dots, guides, readout) laid over it in HTML.

/** pending: not reported yet - not drawn. href: where a click on it goes. */
export type HourPoint = { at: string; clicks: number; impressions: number; pending?: boolean; href?: string };
export type ChartUnit = "hour" | "day";

const W = 600;
const H = 200;
const TOP = 14;
const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const OK = "var(--color-ok)";
const INFO = "var(--color-info)";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** [axis label, readout label]: "4 PM" for an hour (the viewer's time),
 *  "Nov 9" / "Mon, Nov 9" for a day (Google's own date). */
function labelsFor(at: string, unit: ChartUnit): [string, string] {
  if (unit === "hour") {
    const t = new Date(at).toLocaleTimeString([], { hour: "numeric" });
    return [t, t];
  }
  const d = new Date(`${at.slice(0, 10)}T00:00:00Z`);
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return [day, `${WEEKDAYS[d.getUTCDay()]}, ${day}`];
}

/** One day, hour by hour. */
export function HourlyChart({ hours }: { hours: HourPoint[] }) {
  return <PeriodChart points={hours} unit="hour" />;
}

export function PeriodChart({ points: hours, unit }: { points: HourPoint[]; unit: ChartUnit }) {
  const router = useRouter();
  const gOk = useId();
  const gInfo = useId();
  const [labels, setLabels] = useState<Array<[string, string]> | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [shown, setShown] = useState(false);
  const [glide, setGlide] = useState(false);
  // Touch: the point the last tap showed, so a second tap there opens it.
  const [armed, setArmed] = useState<number | null>(null);
  const [pointer, setPointer] = useState("mouse");
  useEffect(() => setLabels(hours.map((h) => labelsFor(h.at, unit))), [hours, unit]);
  const clickable = hours.some((h) => h.href);

  const n = hours.length;
  // Only reported hours are drawn; the lines end at the last one.
  const last = hours.reduce((m, h, i) => (h.pending ? m : i), -1);
  const drawn = hours.slice(0, last + 1);
  const clicks = drawn.reduce((s, h) => s + h.clicks, 0);
  const impressions = drawn.reduce((s, h) => s + h.impressions, 0);
  const maxC = Math.max(1, ...drawn.map((h) => h.clicks)) * 1.14;
  const maxI = Math.max(1, ...drawn.map((h) => h.impressions)) * 1.14;
  const xs = hours.map((_, i) => (n < 2 ? W / 2 : (i * W) / (n - 1)));
  const yC = drawn.map((h) => TOP + (1 - h.clicks / maxC) * (H - TOP));
  const yI = drawn.map((h) => TOP + (1 - h.impressions / maxI) * (H - TOP));
  const lineC = curve(xs.slice(0, last + 1), yC);
  const lineI = curve(xs.slice(0, last + 1), yI);
  const fill = (line: string) => (line ? `${line} L${xs[last].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z` : "");
  const tk = ticks(n, 6);
  const left = (i: number) => `${(xs[i] / W) * 100}%`;
  const pct = (y: number) => `${(y / H) * 100}%`;

  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    if (last < 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const raw = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1));
    setHover(Math.max(0, Math.min(last, raw)));
    setGlide(shown);
    setShown(true);
    setPointer(e.pointerType);
  }
  function onClick() {
    const href = hover != null && hover <= last ? hours[hover].href : undefined;
    if (!href) return;
    if (pointer === "mouse" || armed === hover) router.push(href);
    else setArmed(hover);
  }
  // The overview's motion: guide, dots and readout slide hour to hour
  // (160ms easeOutExpo) and fade in/out; reduced motion gets neither.
  const motion: React.CSSProperties = {
    transition: glide
      ? "left 160ms var(--ease-out-expo), top 160ms var(--ease-out-expo), transform 160ms var(--ease-out-expo), opacity 120ms ease-out"
      : "opacity 120ms ease-out",
    opacity: shown ? 1 : 0,
  };
  const h = hover != null && hover <= last ? hours[hover] : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-line-soft bg-surface px-5 pb-6 pt-6 sm:px-8 sm:pt-7">
      {/* The two totals, in the overview's head style: label, ring dot, number. */}
      <div className="flex flex-wrap gap-x-12 gap-y-4">
        <Total label="People from Google" value={clicks} ring="border-ok" />
        <Total label="Times you showed up" value={impressions} ring="border-info" />
      </div>

      <div className="mt-7">
        <div
          className={cx("relative h-56 touch-none select-none sm:h-64", clickable && "cursor-pointer")}
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setShown(false)}
          onClick={clickable ? onClick : undefined}
        >
          {/* Dashed guides at the labelled hours, like the overview. */}
          {tk.map((i, k) => (
            <span
              key={`g${i}`}
              aria-hidden="true"
              className="arrive-in absolute inset-y-0 w-px border-l border-dashed border-line"
              style={css({ left: left(i), "--at": "200ms", "--i": k, "--step": "45ms" })}
            />
          ))}
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={gInfo} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={INFO} stopOpacity="0.14" />
                <stop offset="100%" stopColor={INFO} stopOpacity="0" />
              </linearGradient>
              <linearGradient id={gOk} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={OK} stopOpacity="0.2" />
                <stop offset="100%" stopColor={OK} stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Blue behind, green in front: people are the headline. */}
            <path d={fill(lineI)} fill={`url(#${gInfo})`} className="arrive-in" style={css({ "--at": "640ms" })} />
            <path
              d={lineI}
              fill="none"
              stroke={INFO}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="arrive-wipe"
              style={css({ "--at": "380ms" })}
            />
            <path d={fill(lineC)} fill={`url(#${gOk})`} className="arrive-in" style={css({ "--at": "680ms" })} />
            <path
              d={lineC}
              fill="none"
              stroke={OK}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="arrive-wipe"
              style={css({ "--at": "420ms" })}
            />
          </svg>
          {/* Where each line ends: a dot, landing after the line does. */}
          {last >= 0 ? (
            <>
              <span
                aria-hidden="true"
                className="arrive-in pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info ring-4 ring-info/20"
                style={css({ left: left(last), top: pct(yI[last]), "--at": "1080ms" })}
              />
              <span
                aria-hidden="true"
                className="arrive-in pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ok ring-4 ring-ok/20"
                style={css({ left: left(last), top: pct(yC[last]), "--at": "1120ms" })}
              />
            </>
          ) : null}
          {h ? (
            <>
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px bg-ink-faint/50 motion-reduce:transition-none!" style={{ ...motion, left: left(hover!) }} />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-info motion-reduce:transition-none!"
                style={{ ...motion, left: left(hover!), top: pct(yI[hover!]) }}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ok motion-reduce:transition-none!"
                style={{ ...motion, left: left(hover!), top: pct(yC[hover!]) }}
              />
              {/* The readout, the overview's box: hour, people, impressions. */}
              <span
                className="pointer-events-none absolute -top-3 z-10 whitespace-nowrap rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] shadow-xl shadow-black/40 motion-reduce:transition-none!"
                style={{
                  ...motion,
                  left: left(hover!),
                  transform: n > 1 && hover! / (n - 1) > 0.75 ? "translateX(calc(-100% - 10px))" : n > 1 && hover! / (n - 1) < 0.25 ? "translateX(10px)" : "translateX(-50%)",
                }}
              >
                <span className="block text-ink-faint">{labels?.[hover!]?.[1] ?? ""}</span>
                <span className="mt-1 flex items-center gap-2 text-ink">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-ok" />
                  <span className="font-semibold tabular-nums">{h.clicks.toLocaleString("en-US")}</span> {h.clicks === 1 ? "person" : "people"}
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-ink">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-info" />
                  <span className="font-semibold tabular-nums">{h.impressions.toLocaleString("en-US")}</span> {h.impressions === 1 ? "impression" : "impressions"}
                </span>
                {h.href ? (
                  <span className="mt-1 block text-[11.5px] text-ink-faint">{pointer === "mouse" || armed === hover ? "Click" : "Tap again"} to open this {unit}</span>
                ) : null}
              </span>
            </>
          ) : null}
        </div>

        {/* The labelled hours, in the viewer's time. */}
        <div className="relative mt-2 h-4 text-[11.5px] leading-4 text-ink-faint" aria-hidden="true">
          {labels
            ? tk.map((i) => (
                <span
                  key={i}
                  className="absolute top-0 whitespace-nowrap"
                  style={{ left: left(i), transform: i === 0 ? "none" : i === n - 1 ? "translateX(-100%)" : "translateX(-50%)" }}
                >
                  {labels[i][0]}
                </span>
              ))
            : null}
        </div>
      </div>

      <p className="arrive-in mt-5 text-[12.5px] text-ink-faint" style={css({ "--at": "900ms" })}>
        {unit === "hour" ? (
          <>
            Times in your time zone. Google counts its days on Pacific time
            {last < n - 1 ? ", and the rest of the day fills in on its own as Google reports it." : ", and its last few hours can still move a little as it finalizes them."}
          </>
        ) : (
          <>
            {clickable ? "Click any day to open it. " : ""}
            {last < n - 1 ? "Google's numbers run two to three days behind, so the last days fill in on their own." : ""}
          </>
        )}
      </p>
      {/* The chart's numbers for screen readers. */}
      <ul className="sr-only">
        {drawn.map((p, i) => (
          <li key={p.at}>
            {labels?.[i]?.[1] ?? p.at}: {p.clicks} {p.clicks === 1 ? "person" : "people"}, {p.impressions} impressions
          </li>
        ))}
      </ul>
    </section>
  );
}

function Total({ label, value, ring }: { label: string; value: number; ring: string }) {
  return (
    <div>
      <p className="text-[14px] font-medium text-ink-muted">{label}</p>
      <p className="mt-2 flex items-center gap-2.5">
        <span aria-hidden="true" className={cx("h-2.5 w-2.5 shrink-0 rounded-full border-[1.5px]", ring)} />
        <span className="text-[2rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
          <CountUp value={value} />
        </span>
      </p>
    </div>
  );
}
