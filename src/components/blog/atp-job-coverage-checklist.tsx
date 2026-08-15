// The real chain between a seed keyword and a page someone can check the
// results of. AnswerThePublic's public product does step 1 only - it has
// never claimed otherwise. DispatchSEO's MCP tools cover all five, per this
// project's own instructions and tool set (get_instructions, propose_suggestion,
// update_suggestion, log_page, get_rankings).

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
  { step: "Seed keyword -> a cloud of related ideas", atp: true, dispatch: true },
  { step: "Judge which idea is actually worth writing", atp: false, dispatch: true },
  { step: "Write the page for the one chosen", atp: false, dispatch: true },
  { step: "Publish it and open the pull request", atp: false, dispatch: true },
  { step: "Track whether it ranks afterward", atp: false, dispatch: true },
] as const;

export function AtpJobCoverageChecklist() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      <div className="grid grid-cols-[1fr,auto,auto] gap-3 border-b border-neutral-800/70 px-4 py-3 text-xs uppercase tracking-wide text-neutral-500 sm:px-5">
        <span>Step in the chain</span>
        <span className="text-center">AnswerThePublic</span>
        <span className="text-center">DispatchSEO</span>
      </div>
      <ul className="divide-y divide-neutral-800/70">
        {ROWS.map((row) => (
          <li key={row.step} className="grid grid-cols-[1fr,auto,auto] items-center gap-3 px-4 py-3 sm:px-5">
            <span className="text-sm text-neutral-200">{row.step}</span>
            <span className={`flex justify-center ${row.atp ? "text-violet-400" : "text-neutral-700"}`}>
              {row.atp ? <DoneIcon /> : <OpenIcon />}
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
