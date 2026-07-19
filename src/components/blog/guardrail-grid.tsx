// The four concrete mechanisms that keep seo-daily.yml + seo-auto-merge.yml
// from turning into a runaway PR machine - real config values (concurrency
// group names, the turn/time caps, the merge gate's file-path scoping), not a
// generic "add safeguards" list.

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3 2 20h20L12 3Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" />
    </svg>
  );
}

const ITEMS = [
  {
    icon: <LockIcon />,
    title: "One PR at a time",
    detail: "concurrency group seo-build, plus a guard step that skips the whole run if a PR labeled seo is already open.",
  },
  {
    icon: <AlertIcon />,
    title: "Fails loud, never silent",
    detail: "preflight steps error explicitly on a broken token or an unreachable MCP - the alternative is a green run that quietly built nothing.",
  },
  {
    icon: <EyeIcon />,
    title: "A human still merges the risky stuff",
    detail: "auto-merge only fires for guide-shaped diffs (files under src/content/blog or src/components/blog) with every check green; anything else waits on the dashboard.",
  },
  {
    icon: <HourglassIcon />,
    title: "Bounded, not eternal",
    detail: "max-turns 150 and a 45-minute job timeout cap how far one run can go before it's cut off.",
  },
] as const;

export function GuardrailGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {ITEMS.map((item) => (
        <div key={item.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {item.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{item.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
