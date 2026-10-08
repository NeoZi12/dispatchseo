"use client";

import { motion } from "motion/react";

// The done beat: when a step's evidence lands while it is on screen, its
// primary gives way to an emerald check that springs in, a ring ripples out
// from it once, and the screen holds for DONE_BEAT_MS before the next step
// enters. Reduced motion keeps the check (it is information) and drops the
// spring and the ripple.

export function DoneBeat({ reduced, label = "Done" }: { reduced: boolean; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-1" role="status" aria-live="polite">
      <CheckBadge reduced={reduced} size="md" ripple />
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 0.15, duration: 0.2 }}
        className="text-sm font-semibold text-emerald-300"
      >
        {label}
      </motion.span>
    </div>
  );
}

/** The emblem a `done` step (You're connected / first article live) opens
 *  with: the same check, larger, with a second slower ring. */
export function DoneEmblem({ reduced, align = "center" }: { reduced: boolean; align?: "center" | "left" }) {
  return (
    <div className={`mb-5 flex ${align === "center" ? "justify-center" : "justify-start"}`}>
      <CheckBadge reduced={reduced} size="lg" ripple double />
    </div>
  );
}

function CheckBadge({
  reduced,
  size,
  ripple,
  double,
}: {
  reduced: boolean;
  size: "md" | "lg";
  ripple?: boolean;
  double?: boolean;
}) {
  const box = size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const icon = size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <span className={`relative flex ${box} items-center justify-center`}>
      {ripple && !reduced ? (
        <>
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-emerald-400"
            initial={{ scale: 1, opacity: 0.7 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.12 }}
            aria-hidden
          />
          {double ? (
            <motion.span
              className="absolute inset-0 rounded-full bg-emerald-400/25"
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ duration: 1.1, ease: "easeOut", delay: 0.3 }}
              aria-hidden
            />
          ) : null}
        </>
      ) : null}
      <motion.span
        className={`relative flex ${box} items-center justify-center rounded-full bg-emerald-400 text-neutral-950 shadow-[0_0_40px_-6px_rgba(52,211,153,0.75)]`}
        initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0, borderRadius: 14 }}
        animate={reduced ? { opacity: 1 } : { scale: 1, opacity: 1, borderRadius: 999 }}
        transition={reduced ? { duration: 0.15 } : { type: "spring", stiffness: 420, damping: 18 }}
      >
        <svg viewBox="0 0 24 24" fill="none" className={icon} aria-hidden>
          <motion.path
            d="m5 12.5 4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          />
        </svg>
      </motion.span>
    </span>
  );
}
