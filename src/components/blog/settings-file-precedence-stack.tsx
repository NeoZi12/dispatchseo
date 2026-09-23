// The five settings sources and their precedence, per
// code.claude.com/docs/en/settings#settings-precedence: "Claude Code uses the
// value from the highest level that sets it," highest listed first - managed,
// command line, project local, shared project, user. Drawn as a stack (not a
// spectrum) because the relationship is strictly "overrides", not a range.

function BuildingIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M5 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" />
      <path d="M13 10h5a1 1 0 0 1 1 1v10" />
      <path d="M8 8h.01M8 12h.01M8 16h.01" />
      <path d="M3 21h18" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="15" rx="1.5" />
      <path d="M7 9.5l3 2.5-3 2.5" />
      <path d="M12.5 15h4.5" />
    </svg>
  );
}

function UserFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M6 3.5h8L18 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.5V7.5H18" />
      <circle cx="11" cy="13.5" r="1.6" />
      <path d="M8.3 18c.5-1.7 1.9-2.6 2.7-2.6s2.2.9 2.7 2.6" />
    </svg>
  );
}

function TeamFileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M6 3.5h8L18 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.5V7.5H18" />
      <circle cx="9.7" cy="12.6" r="1.3" />
      <circle cx="13.3" cy="12.6" r="1.3" />
      <path d="M7.5 17c.4-1.3 1.4-2 2.2-2s1.4.4 1.8 1c.4-.6 1-1 1.8-1s1.8.7 2.2 2" />
    </svg>
  );
}

function LaptopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="4" y="4.5" width="16" height="11" rx="1.2" />
      <path d="M2 19h20" />
      <path d="M9.5 19l1-3.5h3l1 3.5" />
    </svg>
  );
}

const LEVELS = [
  {
    icon: BuildingIcon,
    name: "Managed settings",
    file: "managed-settings.json, MDM, or the claude.ai console",
    who: "Your organization",
    ci: "Only server-managed settings reach a cloud session; a file on the runner's disk doesn't exist unless the image ships one",
  },
  {
    icon: TerminalIcon,
    name: "Command line",
    file: "claude --settings '{...}'",
    who: "This one process, this one run",
    ci: "The only source a workflow step can set fresh every invocation, no file to commit at all",
  },
  {
    icon: UserFileIcon,
    name: "Project local",
    file: ".claude/settings.local.json",
    who: "You, this project only",
    ci: "Git-ignored by design - a fresh Actions checkout never has this file",
  },
  {
    icon: TeamFileIcon,
    name: "Shared project",
    file: ".claude/settings.json",
    who: "Everyone who clones the repo",
    ci: "The only settings FILE a stock GitHub Actions runner can read - it's the one thing in this stack that's actually in the checkout",
  },
  {
    icon: LaptopIcon,
    name: "User",
    file: "~/.claude/settings.json",
    who: "You, every project, this machine",
    ci: "Lives in a home directory a disposable runner never had before and won't keep after",
  },
] as const;

export function SettingsFilePrecedenceStack() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        Settings precedence, highest first - and what actually reaches a GitHub Actions runner
      </h3>
      <ol className="mt-3 space-y-2">
        {LEVELS.map(({ icon: Icon, name, file, who, ci }, i) => (
          <li key={name} className="rounded-lg bg-neutral-950/60 p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-violet-300">
                    <Icon />
                  </span>
                  <span className="text-sm font-medium text-neutral-100">{name}</span>
                  <code className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">{file}</code>
                </div>
                <p className="mt-1 text-xs text-neutral-500">{who}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{ci}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        A key set higher overrides the same key set lower, no matter how specific the lower one is. For an
        unattended run on a fresh checkout, only two of these five sources are ever actually in play: the
        committed <code className="rounded bg-neutral-950 px-1 py-0.5 text-neutral-400">.claude/settings.json</code>{" "}
        and whatever the workflow step itself passes on the command line.
      </p>
    </div>
  );
}
