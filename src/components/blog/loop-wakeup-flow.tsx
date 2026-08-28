// What a self-paced (no-interval) /loop actually does between iterations, per
// the "Let Claude choose the interval" and "Stop a loop" sections of
// code.claude.com/docs/en/scheduled-tasks - the mechanics most /loop posts
// skip past with "Claude picks a delay."

const STEPS = [
  { label: "One iteration runs", detail: "your prompt, or the built-in maintenance prompt if you gave none, executes once" },
  { label: "Claude weighs what it just saw", detail: "a build still running, a PR gone quiet, nothing left pending - the signal, not a clock" },
  { label: "It reschedules itself", detail: "a 1-to-60-minute delay and the reason for it, both printed at the end of the iteration" },
  { label: "Or it calls stop instead", detail: "the task is done - the pending wakeup is cancelled immediately, no more iterations" },
  { label: "Or it does neither", detail: "Claude Code schedules one fallback wakeup ~20 minutes out, then ends the loop if that iteration doesn't reschedule either" },
  { label: "Esc during the wait works the same as stop", detail: "clears the pending wakeup on the spot - fixed-interval tasks aren't affected by Esc" },
] as const;

export function LoopWakeupFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-xs font-medium tabular-nums text-amber-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
