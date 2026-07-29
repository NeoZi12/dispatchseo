// The real branch logic in seo-daily.yml's "Classify the outcome" step - not
// a generic "handle errors" note. A headless run can fail for a reason that
// isn't really a failure (a Claude usage limit, cleared by the next scheduled
// attempt), and treating that the same as a broken credential would either
// hide real breakage or cry wolf on a normal deferral. Three branches, one
// action step, real strings grepped from the workflow file.

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12l3 3 5-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
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

const BRANCHES = [
  {
    icon: <CheckIcon />,
    color: "text-emerald-400",
    border: "border-l-emerald-500/60",
    label: "claude.outcome == success",
    action: "Exit 0. Nothing else to classify - the build either shipped a PR or cleanly found no approved suggestion.",
  },
  {
    icon: <ClockIcon />,
    color: "text-amber-300",
    border: "border-l-amber-500/60",
    label: 'result matches /usage limit|rate.?limit/i',
    action: '"Deferring to the next scheduled attempt (12:00 or 19:00 UTC). Not a failure." Reports ok=1 to the dashboard, exits 0 - a green run.',
  },
  {
    icon: <AlertIcon />,
    color: "text-red-400",
    border: "border-l-red-500/60",
    label: "anything else",
    action: "Reports fail=<message> to the dashboard (banner + alert email), exits 1 - a red run in the Actions tab.",
  },
] as const;

export function ClassifyOutcomeBranches() {
  return (
    <div className="not-prose my-6">
      <p className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        anthropics/claude-code-action@v1 step finishes -&gt;
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {BRANCHES.map((b) => (
          <div key={b.label} className={`rounded-xl border-l-4 bg-neutral-900 p-4 sm:p-5 ${b.border}`}>
            <div className={`flex items-center gap-2 ${b.color}`}>
              {b.icon}
              <span className="font-mono text-xs font-medium">{b.label}</span>
            </div>
            <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{b.action}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
