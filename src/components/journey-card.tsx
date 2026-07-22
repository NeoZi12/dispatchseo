// The progress story card (docs/DASHBOARD_PROGRESS.md) - the emotional
// centerpiece of Home. The visual language is "waypoints on a road": a track
// with stage nodes, the current one lit, the road fading onward past the last
// stage. Deliberately NOT a progress bar - the honesty rule bans percentage
// precision, so the card shows position and firsts, never "87% complete".
// Server-rendered, no state, no animation (the glow is static).

import Link from "next/link";
import { CollapsibleCard } from "./collapsible-card";
import {
  JOURNEY_STAGES,
  STAGE_META,
  type Journey,
  type Milestone,
} from "@/lib/journey";
import type { WeeklyProgress } from "@/lib/progress";

type StageState = "done" | "current" | "ahead";

// Compact display names for the firsts strip - the full labels (kept in
// title tooltips and the Activity feed) are too long to sit six in a row.
const SHORT_MILESTONE: Record<string, string> = {
  first_page_live: "Page live",
  first_page_indexed: "Indexed",
  first_impression: "Seen on Google",
  first_click: "First click",
  first_top10: "Top-10 rank",
  click_100: "100 clicks",
};

function fmtDay(iso: string): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// One waypoint dot. Sizes are fixed per state so the track line always meets
// the node at the same height; the current node carries a static emerald glow.
function Node({ state }: { state: StageState }) {
  if (state === "current") {
    return (
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_14px_2px_rgba(52,211,153,0.45)] ring-4 ring-emerald-400/15"
      />
    );
  }
  if (state === "done") {
    return <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400/80" />;
  }
  return (
    <span
      aria-hidden="true"
      className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-neutral-700 bg-neutral-900"
    />
  );
}

function AheadChip() {
  return (
    <span className="mt-1.5 inline-block rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
      ahead of schedule
    </span>
  );
}

function stageState(i: number, currentIdx: number): StageState {
  return i < currentIdx ? "done" : i === currentIdx ? "current" : "ahead";
}

// ---------- the track, desktop: four waypoints left to right ----------

function TrackHorizontal({ currentIdx, ahead }: { currentIdx: number; ahead: boolean }) {
  return (
    <ol className="hidden grid-cols-4 sm:grid">
      {JOURNEY_STAGES.map((key, i) => {
        const state = stageState(i, currentIdx);
        const meta = STAGE_META[key];
        const last = i === JOURNEY_STAGES.length - 1;
        // The segment after node i is travelled road once stage i+1 is
        // reached; the tail after the last node fades out - the road goes on.
        const travelled = i < currentIdx;
        const seg = last
          ? currentIdx === i
            ? "bg-gradient-to-r from-emerald-400/60 to-transparent"
            : "bg-gradient-to-r from-neutral-800 to-transparent"
          : travelled
            ? "bg-emerald-400/60"
            : "bg-neutral-800";
        return (
          <li key={key} aria-current={state === "current" ? "step" : undefined}>
            <div className="flex h-4 items-center">
              <Node state={state} />
              <div className={`ml-2 mr-2 h-0.5 flex-1 rounded-full ${seg}`} />
            </div>
            <p
              className={`mt-3 pr-3 ${
                state === "current"
                  ? "text-lg font-semibold text-neutral-50"
                  : state === "done"
                    ? "text-base text-neutral-400"
                    : "text-base text-neutral-600"
              }`}
            >
              {meta.label}
            </p>
            <p className={`mt-0.5 pr-3 text-sm ${state === "current" ? "text-neutral-400" : "text-neutral-600"}`}>
              {meta.months}
            </p>
            {state === "current" && ahead ? <AheadChip /> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---------- the track, mobile: a vertical timeline with a left rail ----------

function TrackVertical({ currentIdx, ahead }: { currentIdx: number; ahead: boolean }) {
  return (
    <ol className="sm:hidden">
      {JOURNEY_STAGES.map((key, i) => {
        const state = stageState(i, currentIdx);
        const meta = STAGE_META[key];
        const last = i === JOURNEY_STAGES.length - 1;
        return (
          <li key={key} aria-current={state === "current" ? "step" : undefined} className="flex gap-3">
            <div className="flex w-4 flex-col items-center">
              <div className="flex h-5 items-center">
                <Node state={state} />
              </div>
              {!last ? (
                <div
                  className={`w-0.5 flex-1 rounded-full ${
                    i < currentIdx ? "bg-emerald-400/60" : "bg-neutral-800"
                  }`}
                />
              ) : null}
            </div>
            <div className={last ? "pb-0" : "pb-5"}>
              <p
                className={
                  state === "current"
                    ? "text-lg font-semibold leading-6 text-neutral-50"
                    : state === "done"
                      ? "text-base leading-6 text-neutral-400"
                      : "text-base leading-6 text-neutral-600"
                }
              >
                {meta.label}
                <span
                  className={`ml-2 text-sm font-normal ${
                    state === "current" ? "text-neutral-400" : "text-neutral-600"
                  }`}
                >
                  {meta.months}
                </span>
              </p>
              {state === "current" && ahead ? <AheadChip /> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- the firsts strip: six real first-time moments, filling in ----------

function FirstsStrip({
  milestones,
  freshKeys,
  nextLabel,
}: {
  milestones: Milestone[];
  freshKeys: Set<string>;
  nextLabel: string | null;
}) {
  return (
    <div className="space-y-2 border-t border-neutral-800/70 pt-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-600">Firsts</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
        {milestones.map((m) => {
          const achieved = m.achieved_at != null;
          const fresh = freshKeys.has(m.key);
          const next = !achieved && m.label === nextLabel;
          const short = SHORT_MILESTONE[m.key] ?? m.label;
          return (
            <li
              key={m.key}
              title={m.achieved_at ? `${m.label} · ${fmtDay(m.achieved_at)}` : m.label}
              className={`flex items-center gap-1.5 text-sm ${
                fresh
                  ? "text-emerald-300"
                  : achieved
                    ? "text-neutral-300"
                    : next
                      ? "text-neutral-300"
                      : "text-neutral-600"
              }`}
            >
              {achieved ? (
                <span className={fresh ? "text-emerald-300" : "text-emerald-400"} aria-hidden="true">
                  ✓
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full border ${
                    next ? "border-neutral-400" : "border-neutral-700"
                  }`}
                />
              )}
              {short}
              {next ? <span className="text-neutral-600">· next</span> : null}
              {fresh ? <span className="text-emerald-400/80">· new</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- the card ----------

export function JourneyCard({
  journey,
  weekly,
}: {
  journey: Journey;
  weekly: WeeklyProgress;
}) {
  const isSetup = journey.stage === "setup";
  const currentIdx = JOURNEY_STAGES.indexOf(
    journey.stage as (typeof JOURNEY_STAGES)[number],
  );
  const freshKeys = new Set(journey.fresh_milestones.map((m) => m.key));
  const celebration =
    journey.fresh_milestones.length > 0
      ? `🎉 ${journey.fresh_milestones.map((m) => m.label).join(" · ")} - this week`
      : null;

  // The setup nag is already tiny - no collapse, just the honest state.
  if (isSetup) {
    return (
      <section className="space-y-4 rounded-xl bg-neutral-900 p-4 sm:p-6">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          The journey
        </p>
        {/* No fake timeline for an unmeasured site - say what's missing and
            where to fix it. */}
        <p className="text-base text-neutral-300">
          {journey.expectation}
          {/* Waiting on Google is not actionable - a settings link there
              sends owners to redo a finished step. */}
          {journey.gsc_waiting ? null : (
            <>
              {" "}
              <Link
                href="/settings"
                className="whitespace-nowrap text-sky-400 underline underline-offset-2 hover:text-sky-300"
              >
                Open Settings
              </Link>
            </>
          )}
        </p>
        {weekly.lines.length > 0 ? (
          <p className="border-t border-neutral-800/70 pt-3 text-base text-neutral-300">
            <span className="font-medium text-neutral-100">This week:</span>{" "}
            {weekly.lines.join(" · ")}
          </p>
        ) : null}
      </section>
    );
  }

  // Collapsed by default: the eyebrow + the lit track say where the site is
  // at a glance, and the stat tiles below stay in the first viewport. The
  // words (pace note, expectation, firsts, weekly movers) live behind the
  // chevron. A fresh milestone is the one thing loud enough to surface while
  // collapsed - it doubles as the invitation to open.
  return (
    <CollapsibleCard
      toggleLabel="Show journey details"
      header={
        <>
          {/* eyebrow: names the block, and frames the months below as the
              TYPICAL schedule - where the site is comes from the lit node. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              The journey
            </p>
            <p className="text-xs text-neutral-600">
              the typical timeline · you&apos;re in month {journey.month}
            </p>
          </div>
          <div className="pt-1">
            <TrackHorizontal currentIdx={currentIdx} ahead={journey.ahead_of_schedule} />
            <TrackVertical currentIdx={currentIdx} ahead={journey.ahead_of_schedule} />
          </div>
        </>
      }
      teaser={celebration ? <span className="text-emerald-400">{celebration}</span> : undefined}
    >
      {/* the honest read on where the site is. When the data runs ahead
          of the schedule the pace note is the headline - its own line,
          not a clause jammed against the expectation sentence. */}
      <div className="max-w-3xl space-y-1">
        {journey.ahead_of_schedule && journey.pace_note ? (
          <p className="text-lg font-medium leading-snug text-emerald-300">
            {journey.pace_note}
          </p>
        ) : null}
        <p className="text-base leading-relaxed text-neutral-300">{journey.expectation}</p>
      </div>

      <FirstsStrip
        milestones={journey.milestones}
        freshKeys={freshKeys}
        nextLabel={journey.next_milestone}
      />

      {/* the weekly strip - movers only; an empty week says so honestly. */}
      {weekly.lines.length > 0 ? (
        <p className="border-t border-neutral-800/70 pt-3 text-base text-neutral-300">
          <span className="font-medium text-neutral-100">This week:</span>{" "}
          {weekly.lines.join(" · ")}
        </p>
      ) : (
        <p className="border-t border-neutral-800/70 pt-3 text-base text-neutral-400">
          Quiet week on the numbers - normal during the {journey.stage_label} stage.
        </p>
      )}

      {/* first-time moments in full, the expanded counterpart of the teaser */}
      {celebration ? <p className="text-base text-emerald-400">{celebration}</p> : null}
    </CollapsibleCard>
  );
}
