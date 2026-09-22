// What actually happens to a backgrounded Claude Code session in each of
// these four states, per code.claude.com/docs/en/agent-view (fetched fresh
// for this guide) - the distinction the "does it survive" question actually
// turns on.

function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="5" width="16" height="10" rx="1.2" />
      <path d="M2 19h20M9 19l1-2h4l1 2" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3v8" />
      <path d="M7 6.5a7 7 0 1 0 10 0" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 4.5 4 6 5 6s5-1.5 5-6M7 21c0-4.5 4-6 5-6s5 1.5 5 6" />
    </svg>
  );
}

const SCENARIOS = [
  {
    icon: <LaptopIcon />,
    title: "Terminal or shell closes",
    verdict: "Keeps running",
    detail: "A local supervisor process holds the session open with no terminal attached - this is the case /bg is built for.",
  },
  {
    icon: <MoonIcon />,
    title: "Machine goes to sleep",
    verdict: "Resumes on wake",
    detail: "The docs are explicit that the sleep gap isn't treated as idle time - the process picks back up when the machine does.",
  },
  {
    icon: <PowerIcon />,
    title: "Machine shuts down",
    verdict: "Stops running",
    detail: "Shutting down stops every running session. It shows as failed for up to 48 hours, then stopped - both resumable by attaching, neither still executing.",
  },
  {
    icon: <HourglassIcon />,
    title: "Unattended for about an hour",
    verdict: "Process stops, conversation doesn't",
    detail: "The supervisor frees the process to save resources, but the session isn't deleted - it resumes where it left off on your next reply, or stays running if pinned with Ctrl+T.",
  },
] as const;

export function BgTaskSurvivalGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {SCENARIOS.map((s) => (
        <div key={s.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {s.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{s.title}</h3>
          </div>
          <p className="mt-2.5 text-sm font-medium text-neutral-100">{s.verdict}</p>
          <p className="mt-1.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {s.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
