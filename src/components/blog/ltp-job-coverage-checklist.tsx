// Long Tail Pro's own current homepage (fetched live while writing this
// guide) still lists a keyword-research tool as one of its features - it
// does the first row here, honestly. What it has never done, before or
// after its recent website-builder pivot, is the four rows after that.

function DoneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
    </svg>
  );
}

const ROWS = [
  { step: "Find a long-tail keyword and size its volume + difficulty", ltp: true, dispatch: true },
  { step: "Judge whether this site can actually win it, not just whether it exists", ltp: false, dispatch: true },
  { step: "Write the page targeting it", ltp: false, dispatch: true },
  { step: "Publish it and open the pull request", ltp: false, dispatch: true },
  { step: "Track whether it ranks afterward", ltp: false, dispatch: true },
] as const;

export function LtpJobCoverageChecklist() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      <div className="grid grid-cols-[1fr,auto,auto] gap-3 border-b border-neutral-800/70 px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 sm:px-5">
        <span>Step in the chain</span>
        <span className="text-center">Long Tail Pro</span>
        <span className="text-center">DispatchSEO</span>
      </div>
      <ul className="divide-y divide-neutral-800/70">
        {ROWS.map((row) => (
          <li key={row.step} className="grid grid-cols-[1fr,auto,auto] items-center gap-3 px-4 py-3 sm:px-5">
            <span className="text-sm text-neutral-200">{row.step}</span>
            <span className={`flex justify-center ${row.ltp ? "text-violet-400" : "text-neutral-700"}`}>
              {row.ltp ? <DoneIcon /> : <OpenIcon />}
            </span>
            <span className={`flex justify-center ${row.dispatch ? "text-violet-400" : "text-neutral-700"}`}>
              {row.dispatch ? <DoneIcon /> : <OpenIcon />}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
