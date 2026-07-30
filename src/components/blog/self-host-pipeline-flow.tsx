// What a raw SERP tracking API call actually needs wrapped around it to
// become a rank tracker someone would trust unattended - the same shape
// dispatchseo.com's own daily-ranks cron runs (project isolation via
// Promise.allSettled, a persisted check history, its own delta and alert
// logic in cron-alerts.ts) rather than a generic "collect data" diagram.

const STEPS = [
  {
    label: "Batch every (keyword, location, language) triple",
    detail: "one call per combination, looped per project - not one call per keyword globally, or location/language bugs stay invisible",
  },
  {
    label: "Store every check, not just the latest position",
    detail: "a table shaped like (keyword, position, checked_at) - overwriting one row per keyword throws away the history a trend needs",
  },
  {
    label: "Isolate failures per keyword and per project",
    detail: "one dropped call or one broken project must not fail the whole night's batch - the same reason a multi-tenant cron never lets one failure sink the rest",
  },
  {
    label: "Compute the delta yourself",
    detail: "\"moved from #14 to #9\" is arithmetic against the stored history - the API never returns a comparison, only a snapshot",
  },
  {
    label: "Decide what counts as a regression, and alert on it",
    detail: "nothing pings you by default; a dropped-position threshold and a notification path are both code you write",
  },
] as const;

export function SelfHostPipelineFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
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
