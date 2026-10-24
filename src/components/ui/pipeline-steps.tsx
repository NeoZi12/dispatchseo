import { cx } from "./styles";

/** The hosted writer's steps in the owner's words, in the order it takes
 *  them (writer stages pick+research / plan / write / verify, then the
 *  publish handoff). */
export const PIPELINE = ["Research", "Plan", "Write", "Check facts", "Publish"] as const;

/**
 * Where one article is in the writer, as a row of segments: done steps
 * filled, the current one glowing with a light passing through it, the rest
 * waiting. `labels` names every step under its segment (from sm; a phone
 * gets one line naming the current step instead); without it the row is a
 * compact bar with "Step 3 of 5" beside it, for table rows. `bare` is the
 * bar alone at full width, for a card whose status word already names the
 * step.
 */
export function PipelineSteps({
  current,
  labels = false,
  bare = false,
  className = "",
}: {
  /** 0-based index into PIPELINE. */
  current: number;
  labels?: boolean;
  bare?: boolean;
  className?: string;
}) {
  const at = Math.max(0, Math.min(PIPELINE.length - 1, current));
  const said = `Step ${at + 1} of ${PIPELINE.length}: ${PIPELINE[at]}`;
  const segments = (
    <ol className={cx("grid grid-cols-5 gap-1", labels || bare ? "" : "w-28 shrink-0")} aria-hidden="true">
      {PIPELINE.map((step, i) => (
        <li key={step} className="min-w-0">
          <span
            className={cx(
              "relative block h-1.5 overflow-hidden rounded-full",
              i < at ? "bg-accent/55" : i === at ? "dispatch-breathe dispatch-shimmer bg-accent" : "bg-surface-3",
            )}
          />
          {labels ? (
            <span
              className={cx(
                "mt-2 hidden truncate text-[11.5px] sm:block",
                i < at ? "text-ink-muted" : i === at ? "font-medium text-accent" : "text-ink-faint",
              )}
            >
              {step}
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );

  if (bare) {
    return (
      <div className={cx("min-w-0", className)}>
        <span className="sr-only">{said}</span>
        {segments}
      </div>
    );
  }
  if (labels) {
    return (
      <div className={cx("min-w-0", className)}>
        <span className="sr-only">{said}</span>
        {segments}
        <p className="mt-2 text-[12px] text-ink-muted sm:hidden" aria-hidden="true">
          <span className="font-medium text-accent">{PIPELINE[at]}</span>, step {at + 1} of {PIPELINE.length}
        </p>
      </div>
    );
  }
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <span className="sr-only">{said}</span>
      {segments}
      <span className="text-[11.5px] text-ink-faint tabular-nums" aria-hidden="true">
        Step {at + 1} of {PIPELINE.length}
      </span>
    </div>
  );
}
