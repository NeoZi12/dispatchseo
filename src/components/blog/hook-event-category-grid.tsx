// Every hook event in Claude Code's current reference (code.claude.com/docs/en/hooks),
// grouped and counted by hand from that table - not a recollection of the
// older ~9-23 event lists still circulating from before the event set grew.

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5Z" />
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

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M5 3v18" />
      <path d="M5 4h13l-3 4 3 4H5" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </svg>
  );
}

const CATEGORIES = [
  {
    icon: <ChatIcon />,
    title: "Prompt & session",
    count: 5,
    blockable: 2,
    example: "UserPromptSubmit, SessionStart, SessionEnd",
  },
  {
    icon: <WrenchIcon />,
    title: "Tool calls",
    count: 6,
    blockable: 2,
    example: "PreToolUse, PostToolUse, PermissionRequest",
  },
  {
    icon: <FlagIcon />,
    title: "Turn, subagent & task lifecycle",
    count: 7,
    blockable: 5,
    example: "Stop, SubagentStop, TaskCompleted",
  },
  {
    icon: <GearIcon />,
    title: "Environment, config & MCP",
    count: 13,
    blockable: 5,
    example: "ConfigChange, FileChanged, PreCompact, Elicitation",
  },
] as const;

export function HookEventCategoryGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CATEGORIES.map((c) => (
        <div key={c.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {c.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{c.title}</h3>
          </div>
          <p className="mt-2.5 text-sm text-neutral-300">
            <span className="tabular-nums text-neutral-100">{c.count}</span> events ·{" "}
            <span className="tabular-nums text-neutral-100">{c.blockable}</span> can block
          </p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {c.example}
          </p>
        </div>
      ))}
    </div>
  );
}
