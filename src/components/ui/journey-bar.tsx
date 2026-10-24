import Link from "next/link";
import type { Journey } from "@/lib/journey";
import { JOURNEY_STAGES, STAGE_META } from "@/lib/journey-meta";
import { cx } from "./styles";

// The progress road under the site name: where the site is on the usual SEO
// timeline. Same data and the same honesty rules as the agent dashboard's
// JourneyCard (lib/journey.ts decides the stage; this only draws it): a
// position, never a percentage, and the months are the TYPICAL schedule,
// said as such. Restyled to the hosted tokens and slimmed to one band, so
// it reads as part of the header rather than a card of its own.
//
// Arrival: the travelled road grows in segment by segment, the nodes fade
// up behind it. After that it's still.

export function JourneyBar({ journey, className = "" }: { journey: Journey; className?: string }) {
  if (journey.stage === "setup") {
    return (
      <p className={cx("arrive-up text-[14px] leading-relaxed text-ink-muted", className)} style={{ "--at": "120ms" } as React.CSSProperties}>
        {journey.expectation}{" "}
        {journey.gsc_waiting ? null : (
          <Link href="/google" className="font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent">
            Connect Search Console
          </Link>
        )}
      </p>
    );
  }
  const current = JOURNEY_STAGES.indexOf(journey.stage as (typeof JOURNEY_STAGES)[number]);
  return (
    <div className={cx("min-w-0", className)}>
      <p className="arrive-in mb-3 text-[12.5px] text-ink-faint" style={{ "--at": "120ms" } as React.CSSProperties}>
        The usual SEO timeline. You&apos;re in month {journey.month}
        {journey.ahead_of_schedule ? <span className="text-ok">, ahead of schedule</span> : null}.
      </p>
      <ol className="grid grid-cols-4" aria-label="Where your site is on the usual SEO timeline">
        {JOURNEY_STAGES.map((key, i) => {
          const meta = STAGE_META[key];
          const state = i < current ? "done" : i === current ? "current" : "ahead";
          const last = i === JOURNEY_STAGES.length - 1;
          return (
            <li key={key} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
              <div className="flex h-4 items-center">
                <span
                  aria-hidden="true"
                  style={{ "--at": "160ms", "--i": i } as React.CSSProperties}
                  className={cx(
                    "arrive-up shrink-0 rounded-full",
                    state === "current"
                      ? "h-3.5 w-3.5 bg-ok shadow-[0_0_14px_2px_rgb(52_211_153/0.45)] ring-4 ring-ok/15"
                      : state === "done"
                        ? "h-2.5 w-2.5 bg-ok/80"
                        : "h-2.5 w-2.5 border-2 border-surface-3 bg-canvas",
                  )}
                />
                {/* The road after this stop: travelled once the next stage
                    is reached; past the last stop it fades on - it goes on. */}
                <span
                  aria-hidden="true"
                  style={{ "--at": "200ms", "--i": i } as React.CSSProperties}
                  className={cx(
                    "arrive-grow mx-2 h-0.5 flex-1 rounded-full",
                    last
                      ? state === "current"
                        ? "bg-gradient-to-r from-ok/60 to-transparent"
                        : "bg-gradient-to-r from-surface-3 to-transparent"
                      : i < current
                        ? "bg-ok/60"
                        : "bg-surface-3",
                  )}
                />
              </div>
              <p
                className={cx(
                  "mt-2.5 pr-2 text-[13px] leading-tight sm:text-[14px]",
                  state === "current" ? "font-semibold text-ink" : state === "done" ? "text-ink-muted" : "text-ink-faint",
                )}
              >
                {meta.label}
                {state === "current" ? <span className="sr-only"> (you are here)</span> : null}
              </p>
              <p className={cx("mt-0.5 pr-2 text-[12px]", state === "current" ? "text-ink-muted" : "text-ink-faint/80")}>{meta.months}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
