// What a usage-limit hit actually does in the two modes Claude Code runs in -
// read off code.claude.com's errors and headless-mode docs, not assumed
// symmetric. Interactive gets a documented auto-continue path; headless does
// not, and the docs say so by omission, not by a stated behavior.

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  );
}

function RobotIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="4" y="8" width="16" height="12" rx="2" />
      <path d="M12 8V4M9 14h.01M15 14h.01M9 18h6" />
    </svg>
  );
}

export function InteractiveVsHeadlessLimitSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <TerminalIcon />
          <h3 className="text-sm font-semibold">Interactive session</h3>
        </div>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-300">
          <li>
            <span className="text-neutral-100">v2.1.234+ waits and continues automatically</span> on a
            claude.ai subscription login - a status line reads{" "}
            <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-xs">
              Usage limit reached · continuing automatically at 3:45pm · esc to cancel
            </code>
          </li>
          <li>
            <span className="text-neutral-100">The in-progress turn is preserved</span>, not restarted -
            it resumes from where it stopped once the window resets
          </li>
          <li>
            <span className="text-neutral-100">Esc at an empty prompt cancels the wait</span>, or use{" "}
            <code className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-xs">/rate-limit-options</code>
          </li>
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <RobotIcon />
          <h3 className="text-sm font-semibold">Headless / -p / CI</h3>
        </div>
        <ul className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-300">
          <li>
            <span className="text-neutral-100">No documented auto-wait.</span> Current docs describe the
            interactive behavior only - a scripted run has no terminal to show a countdown to
          </li>
          <li>
            <span className="text-neutral-100">The process exits non-zero</span> like any other run
            failure, per the CLI&apos;s own contract: exit 0 on success, non-zero when the run fails
          </li>
          <li>
            <span className="text-neutral-100">The failure text carries the signal</span> - the same
            &quot;session limit&quot;/&quot;usage limit&quot; wording, printed to stdout as the result, for
            a caller to grep
          </li>
        </ul>
      </div>
    </div>
  );
}
