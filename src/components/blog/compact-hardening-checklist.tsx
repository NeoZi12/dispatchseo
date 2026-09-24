// Four changes that actually survive a compaction, built from what the
// context-window and hooks-guide docs say does and doesn't reload - the
// difference between hoping a scheduled run remembers something and knowing
// it will.

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const ITEMS = [
  {
    title: "Put must-not-forget instructions in project-root CLAUDE.md, not a paths: rule",
    detail:
      "A path-scoped rule only reloads once Claude re-reads a file it matches - the project-root file reloads on every compaction, unconditionally.",
  },
  {
    title: "Add a SessionStart hook matched to the compact source",
    detail:
      "It fires every time a compaction finishes and its stdout is added straight back into context - the one mechanism built specifically for this gap.",
  },
  {
    title: "Set an explicit auto-compact window instead of trusting the tuned default",
    detail:
      "/autocompact 500k (or the autoCompactWindow setting) makes the trigger point a number you chose, not one that depends on which model picked up the run.",
  },
  {
    title: "Keep anything whose exact content matters under 5,000 tokens per file",
    detail:
      "A larger file that gets re-read after compaction comes back as a path reference, not its content - the run knows the file exists, not what's in it.",
  },
] as const;

export function CompactHardeningChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <CheckIcon />
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
