// The research -> build -> PR -> merge loop DispatchSEO runs, annotated with
// WHO decides at each hop (schedule, agent, rule, owner). Shows that the agent
// holds the work steps and a non-agent holds every step that is hard to undo.
// Read from the repo's .github/workflows (seo-weekly-research, seo-dispatch,
// seo-daily, seo-auto-merge).

const STEPS = [
  { when: "Mondays 20:23 UTC", what: "Weekly research", by: "Agent", note: "Proposes ideas into the queue, never builds." },
  { when: "Owner, any time", what: "Approve an idea", by: "You", note: "Or switch on auto-approve for guides." },
  { when: "Every 3 hours", what: "Backend checks if a build is due", by: "Schedule", note: "Fires a dispatch only when work is ready." },
  { when: "Per dispatch", what: "Build the guide, open a PR", by: "Agent", note: "Cannot push to main. Labeled seo." },
  { when: "4x a day", what: "Merge if paths and checks pass", by: "Rule", note: "Allowed directories only, all checks green." },
];

export function UnattendedLoopGateFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Who decides at each hop of the loop</h3>
      <ol className="mt-4 grid gap-2">
        {STEPS.map((s, i) => (
          <li key={s.what} className="flex gap-3 rounded-lg bg-neutral-950/60 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 font-mono text-xs font-semibold text-violet-400">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-medium text-neutral-200">{s.what}</p>
                <span className={`text-xs font-semibold uppercase tracking-wide ${s.by === "Agent" ? "text-violet-400" : "text-amber-300"}`}>{s.by}</span>
              </div>
              <p className="mt-0.5 text-sm text-neutral-400">{s.when} - {s.note}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
