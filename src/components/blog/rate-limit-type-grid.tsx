// The limits a Claude Code user can actually hit, and what unblocks each one -
// read off Anthropic's current rate-limits and costs docs (platform.claude.com,
// code.claude.com), not a single "you've been rate limited" catch-all.

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 12l4-4" />
      <path d="M12 3v2M21 12h-2" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 5 6.5 5 9s-5 4-5 9M17 3c0 5-5 6.5-5 9s5 4 5 9" />
    </svg>
  );
}

function ModelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="8" width="16" height="10" rx="2" />
      <path d="M9 8V5a3 3 0 0 1 6 0v3M9 13h.01M15 13h.01" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18M16 14h2" />
    </svg>
  );
}

const LIMITS = [
  {
    icon: <GaugeIcon />,
    title: "API rate limit",
    who: "Console/API keys, per organization",
    message: "HTTP 429, error type rate_limit_error, with a retry-after header",
    unblock: "Wait out retry-after, or raise the org's RPM/ITPM/OTPM tier",
  },
  {
    icon: <HourglassIcon />,
    title: "Session or weekly limit",
    who: "Pro/Max/Team/Enterprise subscribers",
    message: '"You\'ve hit your session limit · resets 3:45pm" (or weekly)',
    unblock: "Nothing but time - shared across every model, switching with /model does not help",
  },
  {
    icon: <ModelIcon />,
    title: "Opus or Sonnet limit",
    who: "Subscribers, model-family specific",
    message: '"You\'ve hit your Opus limit · resets 3:45pm"',
    unblock: "Switch to a model outside that family with /model and keep working",
  },
  {
    icon: <WalletIcon />,
    title: "Monthly spend cap",
    who: "Console/API organizations",
    message: "HTTP 429 with error_code enforced_spend_limit_reached, no retry-after",
    unblock: "Nothing until 00:00 UTC next month, or raise the cap in Billing",
  },
] as const;

export function RateLimitTypeGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {LIMITS.map((l) => (
        <div key={l.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {l.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{l.title}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{l.who}</p>
          <p className="mt-2.5 font-mono text-xs leading-relaxed text-neutral-300">{l.message}</p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-400">
            <span className="text-emerald-400">Unblocks with: </span>
            {l.unblock}
          </p>
        </div>
      ))}
    </div>
  );
}
