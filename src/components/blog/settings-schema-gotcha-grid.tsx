// Four behaviors sourced from code.claude.com/docs/en/settings (fetched while
// writing this guide, not recalled from training): list-merge vs whole-value
// keys, the two defaultMode values a project/local file can't set, an env var
// silently outranking every settings file, and how a `-p` run handles a
// broken settings file differently than an interactive one.

function MergeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M6 3v6a4 4 0 0 0 4 4h4" />
      <path d="M18 3v6a4 4 0 0 1-4 4" />
      <path d="M12 13v8" />
      <circle cx="6" cy="3" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="18" cy="3" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BlockedModeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="4.5" y="10" width="15" height="10" rx="1.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M8.5 15l7 0" />
    </svg>
  );
}

function EnvOverrideIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M4 6h9" />
      <path d="M4 12h16" />
      <path d="M4 18h6" />
      <path d="M15 15l4-3-4-3" />
    </svg>
  );
}

function SilentSkipIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M6 3.5h8L18 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z" />
      <path d="M13.5 3.5V7.5H18" />
      <path d="M9 13.5l2.5 2.5L15.5 12" opacity="0.35" />
      <path d="M8.5 12l3 3" />
    </svg>
  );
}

const GOTCHAS = [
  {
    icon: MergeIcon,
    title: "Lists merge; a few whole-value keys don't",
    body: "Set permissions.allow in three files and Claude Code combines all three lists. Set fallbackModel in three files and it takes the entire array from only the highest one that defines it - the other two are ignored outright, not merged in.",
  },
  {
    icon: BlockedModeIcon,
    title: "defaultMode: auto or bypassPermissions is a silent no-op in a repo file",
    body: "Both values apply only from user settings, managed settings, or a --permission-mode flag for one session. Written into .claude/settings.json or settings.local.json, Claude Code starts in the ask default instead - with no error.",
  },
  {
    icon: EnvOverrideIcon,
    title: "One exported env var can outrank every settings file",
    body: "ANTHROPIC_MODEL in the shell overrides the model key from every settings file, every time. ANTHROPIC_DEFAULT_MODEL is the gentler pair - it only fills in when no file sets model at all.",
  },
  {
    icon: SilentSkipIcon,
    title: "A broken settings.json fails differently in CI than at your desk",
    body: "Interactively, invalid JSON shows a Settings Error dialog you have to act on. A -p run shows no dialog - it skips the broken file or the bad entry and keeps going, so a trailing comma in CI doesn't fail the job, it just quietly runs with less config than you think it has.",
  },
] as const;

export function SettingsSchemaGotchaGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {GOTCHAS.map(({ icon: Icon, title, body }) => (
        <div key={title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-300">
            <Icon />
          </div>
          <p className="mt-2.5 text-sm font-medium text-neutral-100">{title}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{body}</p>
        </div>
      ))}
    </div>
  );
}
