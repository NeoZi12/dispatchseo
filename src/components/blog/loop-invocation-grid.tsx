// The three /loop shapes, straight from the "What you provide" table at
// code.claude.com/docs/en/scheduled-tasks#run-a-prompt-repeatedly-with-loop -
// interval and prompt are each independently optional, and what's given
// decides which of these three actually runs.

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

function CompassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-2 6-6 2 2-6 6-2Z" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
    </svg>
  );
}

const SHAPES = [
  {
    icon: <ClockIcon />,
    title: "Interval + prompt",
    example: "/loop 5m check the deploy",
    detail: "Runs on the fixed schedule you gave it - Claude converts the interval to a cron expression and confirms the cadence.",
  },
  {
    icon: <CompassIcon />,
    title: "Prompt only",
    example: "/loop check whether CI passed",
    detail: "No interval means Claude picks the wait itself each iteration - 1 to 60 minutes, based on what it just observed.",
  },
  {
    icon: <WrenchIcon />,
    title: "Interval only, or neither",
    example: "/loop  ·  /loop 15m",
    detail: "A bare /loop runs the built-in maintenance prompt (or your own loop.md) at a Claude-chosen interval; add a number to fix the cadence instead.",
  },
] as const;

export function LoopInvocationGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {SHAPES.map((s) => (
        <div key={s.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {s.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{s.title}</h3>
          </div>
          <p className="mt-2.5 font-mono text-xs text-neutral-400">{s.example}</p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {s.detail}
          </p>
        </div>
      ))}
    </div>
  );
}
