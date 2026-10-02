// Where each Claude Code security layer runs and whether it can stop a merge.
// The point of the table: only the last row blocks anything. Every Anthropic
// layer above it produces findings; a merge gate has to be something that can
// say no. Facts follow code.claude.com/docs/en/security-guidance and /commands.

function Shield() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const ROWS = [
  { layer: "Security guidance plugin", runs: "As Claude edits, ends each turn, and on commits Claude makes", stops: "No - findings go back to the writing session" },
  { layer: "/security-review", runs: "When someone types it: the diff against origin's default branch", stops: "No - it prints findings" },
  { layer: "Claude Security plugin", runs: "On demand: multi-agent scan of a repo or diff", stops: "No - findings and patches" },
  { layer: "Code Review", runs: "On each pull request (Team and Enterprise plans)", stops: "No - comments on the PR" },
  { layer: "A required check or merge rule", runs: "On the PR, before the merge button works", stops: "Yes - the merge is refused" },
] as const;

export function ReviewLayerCoverageTable() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-neutral-400">
        <Shield />
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Five layers, one that can refuse a merge
        </h3>
      </div>
      <ul className="mt-4 divide-y divide-neutral-800">
        {ROWS.map((r, i) => (
          <li key={r.layer} className="grid gap-1 py-3 sm:grid-cols-[1.1fr_1.6fr_1.4fr] sm:gap-4">
            <span className="text-sm font-medium text-neutral-200">{r.layer}</span>
            <span className="text-sm text-neutral-400">{r.runs}</span>
            <span className={`text-sm font-semibold ${i === ROWS.length - 1 ? "text-emerald-400" : "text-amber-300"}`}>{r.stops}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
