// What Claude Code's own statusline docs (code.claude.com/docs/en/statusline)
// confirm is NOT in the JSON a statusline script receives - the gap every
// generic "customize your statusline" writeup skips past, and the one that
// actually matters for deciding what a hook is for instead.

function NoEntryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M7 12h10" />
    </svg>
  );
}

const BLIND_SPOTS = [
  {
    title: "Which permission mode it's in",
    detail: "a plan-mode-to-execute flip triggers a redraw, but the mode itself never lands in the payload - the script can react to the change, not report the state",
  },
  {
    title: "Which tool just ran, or its input",
    detail: "no tool_name, no tool_input field anywhere in the schema - that data exists only on the PreToolUse/PostToolUse hook events, a different mechanism entirely",
  },
  {
    title: "A subagent's own numbers, on the main line",
    detail: "cost and context_window describe the top-level session only; a subagent's burn shows up on its own row via the separate subagentStatusLine setting, or not at all",
  },
  {
    title: "Anything, until workspace trust is accepted",
    detail: "the script doesn't run at all until the folder's trust dialog is accepted - the line stays blank, not stale, and claude --debug names the exact reason",
  },
] as const;

export function StatuslineBlindSpotGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {BLIND_SPOTS.map((item) => (
        <div key={item.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-neutral-400">
            <NoEntryIcon />
            <h3 className="text-[15px] font-semibold text-neutral-100">{item.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
