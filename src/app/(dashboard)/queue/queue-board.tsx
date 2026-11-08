// The Queue screen's board: this week's slots and the ideas waiting to
// fill them, in the order they'll be written, each with the day it's
// expected to start. Read-only on purpose (owner, 2026-11-05: owners see
// what's coming, they don't steer it) - no drag, arrows, Set aside, Put
// back or Add topic here any more. The queue is still steerable over MCP
// (reorder_queue, update_suggestion) for the agent and the operator.
//
// The DATES belong to the slots, not to the ideas: slot 1 starts on the
// first date, slot 2 on the second (queue.ts computes them from the plan's
// cadence).

import Link from "next/link";
import type { QueuedIdea } from "@/lib/autopilot/queue";
import type { KdZones } from "@/lib/kd-zones";
import { SignalGlyph } from "@/components/ui/on-air";
import { Line } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/styles";
import { dayDate, fmtInt, shortDate } from "../article-status";

const DAY = 86_400_000;
const LINK = "font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Idea = { id: string; title: string; keyword: string | null; volume: number | null; kd: number | null };

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const dayOf = (t: number) => Math.floor(t / DAY) * DAY;
const dow = (t: number) => (new Date(t).getUTCDay() + 6) % 7; // 0 = Monday

function toIdea(i: QueuedIdea): Idea {
  return { id: i.suggestion_id, title: i.title, keyword: i.keyword, volume: i.volume, kd: i.kd };
}

export function QueueBoard({
  now,
  zones,
  upcoming,
  nextStart,
  usedThisWeek,
  quota,
  paused,
  startedDays,
}: {
  now: number;
  zones: KdZones;
  upcoming: QueuedIdea[];
  nextStart: string | null;
  usedThisWeek: number;
  quota: number;
  paused: boolean;
  startedDays: number[];
}) {
  const ideas = upcoming.map(toIdea);
  // The dates, by slot.
  const slots = upcoming.map((i) => i.expected_start);

  return (
    <>
      <WeekStrip
        now={now}
        startedDays={startedDays}
        slots={slots}
        nextStart={nextStart}
        usedThisWeek={usedThisWeek}
        quota={quota}
        paused={paused}
      />

      {/* ---- the queue ---- */}
      <section aria-labelledby="queue-title" className="space-y-4">
        <div className="arrive-up flex flex-wrap items-end justify-between gap-x-6 gap-y-1" style={css({ "--at": "140ms" })}>
          <div>
            <h2 id="queue-title" className="text-xl font-semibold tracking-tight text-ink">
              Up next
            </h2>
            {ideas.length ? <p className="mt-1 text-[14px] text-ink-muted">Written from the top down, on the days shown.</p> : null}
          </div>
          {ideas.length ? (
            <p className="text-[13px] tabular-nums text-ink-faint">
              {ideas.length} {ideas.length === 1 ? "idea" : "ideas"}
            </p>
          ) : null}
        </div>

        {ideas.length ? (
          <ol className="space-y-3" aria-label="Ideas in the order they will be written">
            {ideas.map((idea, index) => (
              <QueueCard
                key={idea.id}
                idea={idea}
                pos={index + 1}
                date={slots[index] ?? null}
                paused={paused}
                noPlan={quota <= 0}
                now={now}
                zones={zones}
                next={index === 0}
                arrive={Math.min(index, 8)}
              />
            ))}
          </ol>
        ) : (
          <div className="arrive-up rounded-xl border border-dashed border-line px-5 py-8 sm:px-8 sm:py-10" style={css({ "--at": "200ms" })}>
            <p className="text-[17px] font-medium text-ink">Nothing queued yet.</p>
            <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">Research runs weekly and fills this on its own.</p>
          </div>
        )}
      </section>
    </>
  );
}

/* ------------------------------------------------------------ the week */

function WeekStrip({
  now,
  startedDays,
  slots,
  nextStart,
  usedThisWeek,
  quota,
  paused,
}: {
  now: number;
  startedDays: number[];
  slots: Array<string | null>;
  nextStart: string | null;
  usedThisWeek: number;
  quota: number;
  paused: boolean;
}) {
  const today = dayOf(now);
  const monday = today - dow(today) * DAY;
  const days = Array.from({ length: 7 }, (_, i) => monday + i * DAY);
  const halted = paused || quota <= 0;

  // Which slot lands on which day (1-based), this week only.
  const slotOn = new Map<number, number>();
  if (!halted) {
    slots.forEach((d, i) => {
      if (!d) return;
      const t = Date.parse(d);
      if (t >= monday && t < monday + 7 * DAY && !slotOn.has(t)) slotOn.set(t, i + 1);
    });
  }
  // An empty queue still has a next slot: that morning researches first.
  const researchDay = !halted && slots.length === 0 && nextStart ? dayOf(Date.parse(nextStart)) : null;
  const started = new Map<number, number>();
  for (const t of startedDays) started.set(t, (started.get(t) ?? 0) + 1);

  const nextIso = slots[0] ?? nextStart;
  let caption: React.ReactNode;
  if (paused) {
    caption = (
      <>
        Paused, so nothing new starts.{" "}
        <Link href="/dashboard" className={LINK}>
          Resume on Home
        </Link>
      </>
    );
  } else if (quota <= 0) {
    caption = (
      <>
        Your plan includes no articles right now.{" "}
        <Link href="/billing" className={LINK}>
          Open billing
        </Link>
      </>
    );
  } else {
    const t = nextIso ? Date.parse(nextIso) : null;
    const when =
      t == null
        ? null
        : t <= today
          ? "today"
          : t === today + DAY
            ? "tomorrow"
            : t < monday + 7 * DAY
              ? WEEKDAYS[dow(t)]
              : `${WEEKDAYS[dow(t)]}, ${shortDate(nextIso)}`;
    caption = (
      <>
        <span className="font-medium text-ink tabular-nums">
          {Math.min(usedThisWeek, quota)} of {quota}
        </span>{" "}
        this week{when ? ` · next ${when}` : ""}
      </>
    );
  }

  return (
    <section aria-labelledby="week-title" className="arrive-up rounded-2xl border border-line-soft bg-surface px-4 py-5 sm:px-6 sm:py-6" style={css({ "--at": "60ms" })}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
        <h2 id="week-title" className="text-[15px] font-semibold tracking-tight text-ink">
          This week
        </h2>
        <p className="text-[13px] text-ink-muted">{caption}</p>
      </div>
      <ol className={cx("mt-4 grid grid-cols-7 gap-1.5 sm:mt-5 sm:gap-2.5", halted && "opacity-60")}>
        {days.map((t, i) => {
          const isToday = t === today;
          const past = t < today;
          const slot = slotOn.get(t);
          const did = started.get(t) ?? 0;
          const research = researchDay === t;
          const label = isToday ? "Today" : WEEKDAYS[i];
          const what = slot
            ? `number ${slot} in the queue starts`
            : research
              ? "fresh research picks the next topic"
              : did
                ? `${did === 1 ? "an article" : `${did} articles`} started`
                : "nothing";
          return (
            <li key={t} aria-current={isToday ? "date" : undefined} className="min-w-0">
              <p className={cx("mb-1.5 flex flex-col text-[11.5px] leading-tight sm:flex-row sm:gap-1 sm:text-[12px]", isToday ? "font-semibold text-ink" : "text-ink-faint")}>
                <span>{label}</span>
                <span className="tabular-nums opacity-80">{new Date(t).getUTCDate()}</span>
              </p>
              <div
                className={cx(
                  "flex h-11 items-center justify-center rounded-lg text-[15px] font-semibold tabular-nums sm:h-14 sm:text-[17px]",
                  slot === 1
                    ? "dispatch-breathe border border-accent/60 bg-accent-soft text-accent"
                    : slot
                      ? "border border-dashed border-line text-ink-muted"
                      : research
                        ? "dispatch-breathe border border-dashed border-accent/50 text-accent"
                        : did
                          ? "border border-ok/30 bg-ok-soft text-ok"
                          : past
                            ? "bg-surface-2/40"
                            : "bg-surface-2",
                  (Boolean(slot) || did > 0 || research) && "arrive-rise",
                )}
                style={css({ "--at": "180ms", "--i": i, "--step": "45ms" })}
              >
                <span className="sr-only">{`${label === "Today" ? "Today" : WEEKDAYS[i]} ${new Date(t).getUTCDate()}: ${what}.`}</span>
                {slot ? (
                  <span aria-hidden="true">{slot}</span>
                ) : research ? (
                  <SearchGlyph className="h-4 w-4" />
                ) : did ? (
                  <span aria-hidden="true" className="flex items-center gap-0.5">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 sm:h-[18px] sm:w-[18px]">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                    {did > 1 ? <span className="text-[12px]">{did}</span> : null}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------ a card */

function QueueCard({
  idea,
  pos,
  date,
  paused,
  noPlan,
  now,
  zones,
  next,
  arrive,
}: {
  idea: Idea;
  pos: number;
  date: string | null;
  paused: boolean;
  noPlan: boolean;
  now: number;
  zones: KdZones;
  next: boolean;
  /** Stagger index on first paint. */
  arrive: number;
}) {
  return (
    <li
      style={css({ "--at": "200ms", "--i": arrive })}
      className={cx(
        "arrive-up relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl border bg-surface px-3 py-3.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-4 sm:py-4",
        next ? "border-accent/45" : "border-line-soft",
      )}
    >
      {/* Its place in line. */}
      <div className="row-span-2 flex items-center justify-center sm:row-span-1 sm:self-center">
        <span
          aria-label={`Number ${pos}`}
          className={cx("flex h-9 w-9 items-center justify-center text-[18px] font-semibold tabular-nums", next ? "text-accent" : "text-ink-muted")}
        >
          {pos}
        </span>
      </div>

      {/* What it is. */}
      <div className="min-w-0 self-center">
        {next ? (
          <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-accent">
            <SignalGlyph on className="h-3.5 w-3.5 shrink-0" />
            Next up
          </p>
        ) : null}
        <h3 className="text-pretty text-[16px] font-medium leading-snug text-ink sm:text-[17px]">{idea.title}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
          {idea.keyword ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2 py-1 text-[12.5px] text-ink-muted">
              <SearchGlyph className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
              <span className="sr-only">Keyword: </span>
              <span className="truncate">{idea.keyword}</span>
            </span>
          ) : null}
          {/* Research queues nothing without measured numbers; the unknown
              states are for older ideas and an owner's own unmeasurable topic. */}
          {idea.volume != null ? (
            <span className="flex items-baseline gap-1.5">
              <span className="text-[14px] font-semibold tabular-nums text-ink">{fmtInt(idea.volume)}</span>
              <span className="text-[12.5px] text-ink-faint">searches a month</span>
            </span>
          ) : (
            <span className="text-[12.5px] text-ink-faint">volume unknown</span>
          )}
          <Kd kd={idea.kd} zones={zones} />
        </div>
      </div>

      {/* When. */}
      <div className="col-start-2 flex items-center sm:col-start-3 sm:row-start-1 sm:justify-center">
        <DateTile date={date} now={now} next={next} paused={paused} noPlan={noPlan} />
      </div>
    </li>
  );
}

function Kd({ kd, zones }: { kd: number | null; zones: KdZones }) {
  if (kd == null) {
    return <span className="text-[12.5px] text-ink-faint">KD unknown</span>;
  }
  // The colour says easy / a stretch / hard for this site; no word needed.
  const tone = kd < zones.autoApprove ? "text-ok" : kd < zones.pending ? "text-warn" : "text-danger";
  return (
    <span className={cx("flex items-center gap-2", tone)}>
      <span aria-hidden="true" className="relative h-1.5 w-10 overflow-hidden rounded-sm bg-surface-3">
        <span className="absolute inset-y-0 left-0 rounded-sm bg-current" style={{ width: `${Math.max(4, Math.min(100, kd))}%` }} />
      </span>
      <span className="text-[14px] font-semibold tabular-nums">KD {kd}</span>
      <span className="sr-only">{tone === "text-ok" ? "(easy for your site)" : tone === "text-warn" ? "(a stretch for your site)" : "(hard for your site)"}</span>
    </span>
  );
}

function DateTile({ date, now, next, paused, noPlan }: { date: string | null; now: number; next: boolean; paused: boolean; noPlan: boolean }) {
  let top: string;
  let bottom: React.ReactNode;
  let spoken: string;
  if (paused || noPlan) {
    top = paused ? "Paused" : "No plan";
    bottom = "No date";
    spoken = paused ? "No date while paused" : "No date: the plan includes no articles";
  } else if (!date) {
    // Just put back: its slot's date arrives with the server's next answer.
    top = "Scheduling";
    bottom = <Line className="mt-1 h-4 w-12" />;
    spoken = "Working out its date";
  } else {
    const words = dayDate(date, now);
    spoken = `Expected to start ${words}`;
    if (words === "today" || words === "tomorrow") {
      top = words === "today" ? "Today" : "Tomorrow";
      bottom = shortDate(date);
    } else {
      const [weekday, md] = words.split(", ");
      top = weekday;
      bottom = md;
    }
  }
  return (
    <div
      className={cx(
        "flex min-w-[5.75rem] flex-col rounded-lg border px-3 py-1.5 sm:items-center sm:text-center",
        next && !paused && !noPlan ? "border-accent/40 bg-accent-soft" : "border-line-soft bg-surface-2",
      )}
    >
      <span className="sr-only">{spoken}</span>
      <span aria-hidden="true" className={cx("text-[11.5px] font-medium", next && !paused && !noPlan ? "text-accent" : "text-ink-faint")}>
        {top}
      </span>
      <span aria-hidden="true" className="text-[16px] font-semibold leading-tight tabular-nums text-ink">
        {bottom}
      </span>
    </div>
  );
}

function SearchGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className={className} aria-hidden="true">
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.2 10.2L13.5 13.5" />
    </svg>
  );
}
