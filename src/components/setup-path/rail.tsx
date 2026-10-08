"use client";

import { motion } from "motion/react";
import type { SetupStep, StepId } from "@/lib/setup-path-core";

// The connect-phase progress rail: one dot per step the branch walks.
// Done = filled emerald with a check that draws itself; current = violet with
// a slow breathing ring; upcoming = hollow. A parked step reads as a dashed
// amber ring so "skipped for now" never looks like "done". Only the current
// dot carries a label - the rail says where you are, not the whole map.

// Rail labels of the steps "I'll do this later" can park, back to their ids
// (the rail only carries labels; the step's `deferred` list carries ids).
const PARKABLE_LABEL: Record<string, StepId> = {
  WordPress: "wordpress",
  "Your agent": "agent_connect",
  "Claude app": "chat_connect",
  Google: "google_connect",
  Property: "gsc_property",
};

type DotState = "done" | "current" | "upcoming" | "parked";

export function SetupRail({
  rail,
  deferred,
  allDone,
  reduced,
}: {
  rail: SetupStep["rail"];
  deferred: StepId[];
  /** The celebration screen: every dot, the last one included, is done. */
  allDone?: boolean;
  reduced: boolean;
}) {
  const parked = new Set(deferred);
  const states: DotState[] = rail.labels.map((label, i) => {
    const id = PARKABLE_LABEL[label];
    if (i < rail.index) return id && parked.has(id) ? "parked" : "done";
    if (i === rail.index) return allDone ? "done" : "current";
    return id && parked.has(id) ? "parked" : "upcoming";
  });

  return (
    <nav aria-label="Setup progress" className="mx-auto mb-10 w-full max-w-md sm:mb-8">
      <ol className="flex items-start">
        {rail.labels.map((label, i) => {
          const state = states[i];
          const last = i === rail.labels.length - 1;
          // The end labels anchor to their dot's outer edge instead of
          // centring on it, so "Your site" / "Connected" never hang past
          // the rail (and off a 390 px screen).
          const labelPos = i === 0 ? "left-0 text-left" : last ? "right-0 text-right" : "text-center";
          return (
            <li key={label + i} className={`relative flex items-start ${last ? "" : "flex-1"}`}>
              <div className="relative flex flex-col items-center">
                <Dot state={state} reduced={reduced} delay={i * 0.06} />
                {i === rail.index ? (
                  <motion.span
                    key={label}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: reduced ? 0.15 : 0.3 }}
                    className={`absolute top-7 w-max max-w-[6rem] text-xs font-medium leading-tight text-neutral-300 ${labelPos}`}
                  >
                    {label}
                  </motion.span>
                ) : null}
                <span className="sr-only">
                  {label}: {state === "current" ? "current step" : state}
                </span>
              </div>
              {last ? null : (
                <div className="mx-1 mt-[9px] h-px min-w-2 flex-1 overflow-hidden rounded bg-neutral-800 sm:mx-1.5" aria-hidden>
                  <motion.div
                    className="h-full origin-left bg-emerald-400/50"
                    initial={false}
                    animate={{ scaleX: i < rail.index ? 1 : 0 }}
                    transition={{ duration: reduced ? 0.15 : 0.5, ease: "easeOut" }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="sr-only">
        Step {Math.min(rail.index + 1, rail.total)} of {rail.total}
      </p>
    </nav>
  );
}

function Dot({ state, reduced, delay }: { state: DotState; reduced: boolean; delay: number }) {
  if (state === "done") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 shadow-[0_0_14px_-3px_rgba(52,211,153,0.7)]">
        <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" aria-hidden>
          <motion.path
            d="m5 12.5 4.5 4.5L19 7.5"
            stroke="#0a0a0a"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay }}
          />
        </svg>
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        {reduced ? null : (
          <motion.span
            className="absolute inset-0 rounded-full bg-violet-500/40"
            animate={{ scale: [1, 1.9], opacity: [0.55, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            aria-hidden
          />
        )}
        <span className="relative h-5 w-5 rounded-full border-2 border-violet-400 bg-violet-500 shadow-[0_0_16px_-2px_rgba(139,92,246,0.8)]" />
      </span>
    );
  }
  if (state === "parked") {
    return (
      <span
        className="h-5 w-5 rounded-full border-2 border-dashed border-amber-400/60 bg-neutral-950"
        title="Parked for later"
      />
    );
  }
  return <span className="h-5 w-5 rounded-full border-2 border-neutral-700 bg-neutral-950" />;
}
