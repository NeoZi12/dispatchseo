// The path a timed-out scheduled run takes from the wrapper's exit code to a
// dashboard banner: the five steps that turn a dead process into a visible
// failure. Mirrors this repo's "Report outcome to the dashboard" workflow step
// and the deploy-check?job=&fail= endpoint.

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-neutral-600 max-sm:rotate-90" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.5 2M9.5 3h5" />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 4v16M6 8c0 4 12 2 12 8M18 16v4M18 4v4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16ZM10 21h4" />
    </svg>
  );
}

const STEPS = [
  { icon: <ClockIcon />, title: "Wrapper kills the run", detail: "timeout --kill-after=30 40m claude -p ..." },
  { icon: <BranchIcon />, title: "Exit code is read", detail: "124 or 137 means timed out, anything else non-zero means failed" },
  { icon: <SendIcon />, title: "Outcome is posted", detail: "curl to /api/cron/deploy-check with job= and fail=" },
  { icon: <BellIcon />, title: "Banner and email", detail: "The failure shows on the Home banner and emails the owner" },
] as const;

export function TimedOutRunReportFlow() {
  return (
    <div className="not-prose my-6 flex flex-col gap-3 sm:flex-row sm:items-stretch">
      {STEPS.map((s, i) => (
        <div key={s.title} className="flex flex-1 items-center gap-3 sm:flex-row max-sm:flex-col">
          <div className="w-full flex-1 rounded-xl bg-neutral-900 p-4">
            <div className="flex items-center gap-2 text-violet-400">
              {s.icon}
              <h3 className="text-sm font-semibold text-neutral-100">{s.title}</h3>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-neutral-500">{s.detail}</p>
          </div>
          {i < STEPS.length - 1 ? <ArrowIcon /> : null}
        </div>
      ))}
    </div>
  );
}
