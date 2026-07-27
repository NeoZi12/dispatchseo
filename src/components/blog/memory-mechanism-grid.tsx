// Four things people mean when they say "Claude memory" - two live inside
// Claude Code (CLAUDE.md, auto memory), one is scoped to a single subagent,
// and one isn't Claude Code at all (the Claude Platform API's memory tool).
// Conflating the last one with the first three is the most common mix-up on
// page 1 for this term.

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function PenNoteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v5h5" />
      <path d="m9.5 16.5 1-3 5-5 2 2-5 5-3 1Z" />
    </svg>
  );
}

function PuzzleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 8h3.2a1.6 1.6 0 0 0 1.6-2.6c-.5-.6-.8-1-.8-1.6a2 2 0 0 1 4 0c0 .6-.3 1-.8 1.6A1.6 1.6 0 0 0 14.8 8H18v3.2a1.6 1.6 0 0 0 2.6 1.6c.6-.5 1-.8 1.6-.8a2 2 0 0 1 0 4c-.6 0-1-.3-1.6-.8a1.6 1.6 0 0 0-2.6 1.6V20H6v-4a1.6 1.6 0 0 0-2.6-1.6c-.6.5-1 .8-1.6.8a2 2 0 0 1 0-4c.6 0 1 .3 1.6.8A1.6 1.6 0 0 0 6 11.2V8Z" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="6" rx="1.3" />
      <rect x="4" y="14" width="16" height="6" rx="1.3" />
      <path d="M8 7h.01M8 17h.01" />
    </svg>
  );
}

const ITEMS = [
  {
    icon: <DocIcon />,
    title: "CLAUDE.md",
    who: "You write it",
    detail: "Instructions and rules, loaded in full every session. Lives in a Claude Code project, checked into git.",
  },
  {
    icon: <PenNoteIcon />,
    title: "Auto memory",
    who: "Claude writes it",
    detail: "Notes on your corrections and preferences, saved to MEMORY.md. On by default, no CLAUDE.md editing required.",
  },
  {
    icon: <PuzzleIcon />,
    title: "Subagent memory",
    who: "One subagent writes it",
    detail: "Opt-in per subagent via the memory frontmatter field - scoped to that subagent, invisible to the main session.",
  },
  {
    icon: <ServerIcon />,
    title: "Platform memory tool",
    who: "Your own app code writes it",
    detail: "A Claude API tool-use feature for apps you build against the Messages API. Not part of Claude Code at all.",
  },
] as const;

export function MemoryMechanismGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {ITEMS.map((item) => (
        <div key={item.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {item.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{item.title}</h3>
          </div>
          <p className="mt-1.5 text-xs uppercase tracking-wide text-neutral-500">{item.who}</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
