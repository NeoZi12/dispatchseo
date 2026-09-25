// Not a generic "cron runs a job" diagram - the actual shape of this repo's
// own scheduled crons (src/app/api/cron/*/route.ts): a plain loop over every
// tenant wrapped in Promise.allSettled, reported to cron_runs regardless of
// outcome, with the banner/email rail reserved for a real regression per
// CLAUDE.md's setup-gate rule.

const STEPS = [
  {
    label: "A scheduler ticks on its own clock",
    detail: "a Vercel cron entry or a GitHub Actions schedule: trigger fires with no session, no thread, and no human watching",
  },
  {
    label: "Loop over every tenant, not one",
    detail: "listProjects() returns every project this deployment manages - a plain map, never a coordinator delegating tasks to teammates",
  },
  {
    label: "Wrap the whole map in Promise.allSettled",
    detail: "one project's expired token or missing GSC creds rejects that project's promise alone; every sibling promise still resolves on schedule",
  },
  {
    label: "Report the run regardless of outcome",
    detail: "reportCronRun() writes to cron_runs whether the run fully succeeded, partially failed, or was a clean mid-setup skip",
  },
  {
    label: "Only a real regression reaches a human",
    detail: "the dashboard banner and the debounced Resend email fire on hadError - never on an expected 'setup incomplete' skip",
  },
] as const;

export function ScheduledFleetIsolationFlow() {
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
