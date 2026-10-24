"use client";

// Client component for weight, not interactivity: the server still renders
// it into the HTML, but the RSC payload carries only the cards (a few
// hundred bytes) instead of the whole 35-cell grid as a tree.
import Link from "next/link";
import { PipelineSteps } from "./pipeline-steps";
import { Popover } from "./popover";
import { StatusPill, type StatusTone } from "./status-pill";
import { cx, FOCUS_RING } from "./styles";

// "This month" as the calendar everyone already reads: the current month,
// Monday first, each article sitting on its day with its status in a plain
// word, and the queued topics dashed on the days they're due. Quiet on
// purpose (owner, 2026-10-24: "a bit cleaner"): no slabs, no column lines,
// a hairline between weeks, and ONE marker for today - its number in a
// filled circle, like Google Calendar. Colour is left to the cards: green
// happened, violet is being written, amber needs you. Rule since the
// cadence strip: if it needs a legend, it's too abstract.
//
// Desktop: the month grid. Phone: seven columns don't fit, so it reads as a
// diary - only the days that have something on them, today always.

export type CalCard = {
  key: string;
  /** UTC midnight of the day it sits on. */
  day: number;
  title: string;
  /** The status word ("Live", "Writing now", "Waiting for you", "Up next"). */
  word: string;
  tone: StatusTone;
  live?: boolean;
  /** Pipeline step for an article being written: the card reads "In
   *  progress" and opens onto the steps. */
  step?: number | null;
  /** The sentence for where it is (stepLine), shown in the steps popover. */
  stepText?: string;
  /** Hasn't happened yet: drawn dashed. */
  upcoming?: boolean;
  href?: string;
  external?: boolean;
};

const DAY = 86_400_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CARD: Record<StatusTone, string> = {
  ok: "border-ok/25 bg-ok-soft",
  active: "border-accent/30 bg-accent-soft",
  warn: "border-warn/35 bg-warn-soft",
  danger: "border-danger/25 bg-danger-soft",
  neutral: "border-line bg-surface-2",
};

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const dow = (t: number) => (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday

export function MonthBoard({ cards, today, at = 0 }: { cards: CalCard[]; /** UTC midnight today. */ today: number; at?: number }) {
  const d = new Date(today);
  const first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0);
  const gridStart = first - dow(first) * DAY;
  const weeks = Math.ceil((last - gridStart) / DAY / 7 + 1 / 7);
  const rows = Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, k) => gridStart + (w * 7 + k) * DAY));
  const on = (t: number) => cards.filter((c) => c.day === t);
  // The diary: days with something on them, plus today, in order.
  const diary = rows.flat().filter((t) => t >= first && t <= last && (t === today || on(t).length > 0));

  return (
    <>
      {/* ---- desktop: the month ---- */}
      <div className="hidden lg:block">
        <div className="grid grid-cols-7 gap-2 px-2 pb-2 text-[12px] font-medium text-ink-faint" aria-hidden="true">
          {WEEKDAYS.map((w) => (
            <span key={w} className="px-2">
              {w}
            </span>
          ))}
        </div>
        <ol className="divide-y divide-line-soft border-y border-line-soft">
          {rows.map((week, wi) => (
            <li
              key={week[0]}
              className="arrive-up grid grid-cols-7 gap-2 px-1.5 py-2"
              style={css({ "--at": `${at}ms`, "--i": wi, "--step": "70ms" })}
            >
              {week.map((t) => {
                const inMonth = t >= first && t <= last;
                const mine = inMonth ? on(t) : [];
                return (
                  // Every week the same height whether it's empty or not; a
                  // busy day grows its row, which is the information.
                  <div key={t} aria-current={t === today ? "date" : undefined} className="mb-cell">
                    <DayLabel t={t} today={today} inMonth={inMonth} at={at} />
                    {mine.map((c) => (
                      <DayCard key={c.key} c={c} compact align={dow(t) < 2 ? "left" : dow(t) > 4 ? "right" : "center"} />
                    ))}
                  </div>
                );
              })}
            </li>
          ))}
        </ol>
      </div>

      {/* ---- phone: the diary ---- */}
      <ol className="space-y-1.5 lg:hidden">
        {diary.map((t, i) => {
          const mine = on(t);
          return (
            <li
              key={t}
              aria-current={t === today ? "date" : undefined}
              className="arrive-up flex min-w-0 gap-3 border-t border-line-soft px-1 py-3 first:border-t-0"
              style={css({ "--at": `${at}ms`, "--i": i, "--step": "60ms" })}
            >
              <div className="w-16 shrink-0 pt-0.5">
                <DayLabel t={t} today={today} inMonth at={at} withWeekday />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {mine.length ? (
                  mine.map((c) => <DayCard key={c.key} c={c} />)
                ) : (
                  <p className="pt-0.5 text-[13px] text-ink-faint">Nothing today.</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function DayLabel({ t, today, inMonth, withWeekday = false }: { t: number; today: number; inMonth: boolean; at: number; withWeekday?: boolean }) {
  const date = new Date(t).getUTCDate();
  if (t === today) {
    // The one marker for today: the number, filled. Readable on its own;
    // the word is for screen readers.
    return (
      <p className="flex items-center gap-1.5 text-[13px]">
        {withWeekday ? <span className="font-medium text-ink">{WEEKDAYS[dow(t)]}</span> : null}
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 font-semibold tabular-nums text-canvas">{date}</span>
        <span className="sr-only">(today)</span>
      </p>
    );
  }
  return (
    <p className={cx("mb-num", !inMonth ? "text-ink-faint/30" : "text-ink-faint")}>
      {withWeekday ? <span className="mr-1.5">{WEEKDAYS[dow(t)]}</span> : null}
      {date}
    </p>
  );
}

function DayCard({ c, compact = false, align = "left" }: { c: CalCard; compact?: boolean; align?: "left" | "right" | "center" }) {
  const title = (
    <span
      className={cx(
        "mt-1 block leading-snug",
        compact ? "line-clamp-2 text-[12px]" : "line-clamp-3 text-[13px]",
        c.upcoming ? "text-ink-muted" : "text-ink",
      )}
      title={c.title}
    >
      {c.title}
    </span>
  );
  const pill = (
    <StatusPill tone={c.tone} live={c.live} className={compact ? "text-[11.5px]" : "text-[12.5px]"}>
      {c.word}
    </StatusPill>
  );
  const box = cx(
    "block min-w-0 rounded-lg border transition-colors",
    compact ? "px-2 py-1.5" : "px-3 py-2.5",
    c.upcoming ? "border-dashed border-line bg-transparent" : CARD[c.tone],
  );

  // In flight: one calm line instead of the five-step bar - the word, a live
  // dot, a slow light along a thin line - and a click opens the steps.
  if (c.step != null) {
    return (
      <Popover
        label="Where this article is"
        align={align}
        triggerClassName={cx(box, "rounded-lg hover:border-accent/60")}
        trigger={
          <>
            {pill}
            {title}
            <span aria-hidden="true" className="dispatch-flow relative mt-2 block h-0.5 overflow-hidden rounded-full bg-accent/35" />
          </>
        }
      >
        <p className="text-[14px] font-semibold leading-snug text-ink">{c.title}</p>
        <PipelineSteps current={c.step} labels className="mt-4" />
        {c.stepText ? <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">{c.stepText}</p> : null}
        {c.href ? (
          <Link href={c.href} className="mt-4 inline-block text-[13px] font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
            Full details
          </Link>
        ) : null}
      </Popover>
    );
  }

  const body = (
    <>
      {pill}
      {title}
    </>
  );
  const cls = cx(box, c.href ? cx("hover:border-ink-faint/50", FOCUS_RING) : "");
  if (!c.href) return <div className={cls}>{body}</div>;
  if (c.external) {
    return (
      <a href={c.href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={c.href} className={cls}>
      {body}
    </Link>
  );
}
