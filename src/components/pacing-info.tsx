"use client";

import { useEffect, useState } from "react";
// Types only - pacing.ts rides on the service-role client and must never be
// bundled into the browser; `import type` is erased at compile time.
import type { Pacing } from "@/lib/pacing";

// The publishing-pace strip at the top of Home: one quiet line stating the
// pace (one guide a day) and whether today's slot is still open, with a
// "why this pace?" button that opens the plain-English explainer - why the
// cap is daily and flat, what actually protects the site (the quality
// gates), and how the owner's own merges interact with the slot.

export function PacingLine({ pacing }: { pacing: Pacing }) {
  const [open, setOpen] = useState(false);

  // Escape closes the explainer, like any dialog should.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const slotUsed = !pacing.build_allowed;

  return (
    <>
      <p className="text-sm text-neutral-400">
        Publishing pace:{" "}
        <span className="font-medium text-neutral-200">one guide a day</span> ·{" "}
        {slotUsed ? "today's slot is used" : "today's slot is open"} ·{" "}
        {pacing.guides_built_last_7d} shipped in the last 7 days ·{" "}
        <button
          onClick={() => setOpen(true)}
          className="text-sky-400 underline underline-offset-2 transition-colors hover:text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          why this pace?
        </button>
      </p>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Why this publishing pace"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl bg-neutral-900 p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">Why this publishing pace?</p>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md px-2 py-0.5 text-sm text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-neutral-400">
              At most <span className="text-neutral-200">one guide ships per day</span> - every
              morning the builder takes the top of your queue, and that&apos;s the whole rule.
              Guides you merge yourself count too: a manual merge uses the day&apos;s slot, and
              the builder simply resumes the next morning.
            </p>
            <p className="text-sm text-neutral-400">
              Why cap it at all? Google doesn&apos;t punish publishing <em>speed</em> - it
              punishes thin, templated content at scale. That risk is carried by the quality
              gates (every draft must beat the current page 1, and a sameness check compares it
              against your whole back catalogue before it ships). The daily slot just keeps the
              cadence steady and predictable instead of bursts followed by silence.
            </p>

            {/* Today's slot - the one live fact the rule turns on. */}
            <div className="rounded-lg bg-neutral-950/60 p-3 text-sm">
              {slotUsed ? (
                <p className="text-neutral-300">
                  <span className="font-medium text-amber-400">Today&apos;s slot is used</span> -
                  a guide already shipped today. The next build runs tomorrow morning.
                </p>
              ) : (
                <p className="text-neutral-300">
                  <span className="font-medium text-emerald-400">Today&apos;s slot is open</span>
                  {pacing.days_since_last_guide != null ? (
                    <>
                      {" "}
                      - the last guide shipped {pacing.days_since_last_guide} day
                      {pacing.days_since_last_guide === 1 ? "" : "s"} ago. The next approved
                      guide builds on the next morning run.
                    </>
                  ) : (
                    <> - no guide has shipped yet. The first approved guide builds on the next morning run.</>
                  )}
                </p>
              )}
            </div>

            <p className="text-xs text-neutral-400">
              Shipped in the last 7 days: {pacing.guides_built_last_7d} guide
              {pacing.guides_built_last_7d === 1 ? "" : "s"}. A day with no approved ideas in
              the queue is the only other reason a morning passes without a build.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
