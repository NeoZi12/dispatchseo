// Same starting signal (a rank change or a Search Console gap), two different
// stopping points - Serpstat's dashboard hands the signal to a person at every
// step, DispatchSEO's queue carries it straight through to a PR. Steps are
// this project's own tool chain (get_rankings, propose_suggestion,
// update_suggestion, log_page), not a generic claim.

const SERPSTAT_STEPS = [
  "Rank Tracker flags a position change",
  "You open the dashboard to see it",
  "You decide what, if anything, to write",
  "You open Content Marketing and prompt a draft",
  "You edit it and publish it yourself",
];

const DISPATCHSEO_STEPS = [
  "get_rankings flags the same kind of change",
  "The gap is checked against a live SERP",
  "A passing idea is queued and approved",
  "The draft, visuals, and humanizer pass run unattended",
  "log_page records the PR - no dashboard opened",
];

function StepList({ steps, dim }: { steps: readonly string[]; dim: boolean }) {
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s} className="flex items-start gap-2.5">
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-medium tabular-nums ${
              dim ? "bg-neutral-800 text-neutral-500" : "bg-violet-500/20 text-violet-300"
            }`}
          >
            {i + 1}
          </span>
          <span className={`text-sm leading-relaxed ${dim ? "text-neutral-400" : "text-neutral-200"}`}>
            {s}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function SerpstatDecideShipSplit() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Serpstat&apos;s Rank Tracker, same signal
        </h3>
        <div className="mt-3">
          <StepList steps={SERPSTAT_STEPS} dim />
        </div>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          DispatchSEO&apos;s queue
        </h3>
        <div className="mt-3">
          <StepList steps={DISPATCHSEO_STEPS} dim={false} />
        </div>
      </div>
    </div>
  );
}
