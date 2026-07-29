// The four flags that actually decide whether a `claude -p` invocation
// behaves like a CI job or an interactive session - each paired with how
// dispatchseo.com's own seo-daily.yml uses (or deliberately doesn't use) it,
// not a generic flag-reference restatement.

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </svg>
  );
}

function BracesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M8 4c-2 0-2 1.5-2 3v2c0 1-1 2-2 2 1 0 2 1 2 2v2c0 1.5 0 3 2 3M16 4c2 0 2 1.5 2 3v2c0 1 1 2 2 2-1 0-2 1-2 2v2c0 1.5 0 3-2 3" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
    </svg>
  );
}

const FLAGS = [
  {
    icon: <TerminalIcon />,
    flag: "-p / --print",
    spec: "Runs one prompt non-interactively and exits when it's done - the base flag everything else here builds on.",
    real: "anthropics/claude-code-action@v1 wraps this exact flag; seo-daily.yml never calls the claude binary directly.",
  },
  {
    icon: <BracesIcon />,
    flag: "--output-format json",
    spec: "Returns a JSON result envelope (is_error, result, session_id, total_cost_usd) instead of plain text - the thing a script should parse.",
    real: "is_error matched the process exit code in every real invocation tried while writing this guide (below) - result is prose for a log, not a gate.",
  },
  {
    icon: <ShieldIcon />,
    flag: "--permission-mode bypassPermissions",
    spec: "Skips every interactive tool-approval prompt - required once nobody's there to click allow.",
    real: "seo-daily.yml passes it, but only inside a throwaway GitHub-hosted runner for this one repo, never on a machine holding other data.",
  },
  {
    icon: <BoltIcon />,
    flag: "--bare",
    spec: "Skips hook, skill, plugin, MCP, auto-memory, and CLAUDE.md auto-discovery so a scripted call starts faster and can't pick up a teammate's local hook by accident.",
    real: "seo-daily.yml does the opposite on purpose - it wants CLAUDE.md loaded, so it never passes --bare and gets the repo's conventions every run.",
  },
] as const;

export function HeadlessFlagGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {FLAGS.map((f) => (
        <div key={f.flag} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {f.icon}
            <h3 className="font-mono text-sm font-semibold text-neutral-100">{f.flag}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{f.spec}</p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {f.real}
          </p>
        </div>
      ))}
    </div>
  );
}
