// The five things Claude Code's own checkpointing docs list, under
// "Limitations," as changes /rewind cannot undo - grouped here as one grid
// instead of a buried bullet list, because this is the part someone deciding
// whether checkpoints are "enough" actually needs to see first.

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

const BLIND_SPOTS = [
  {
    title: "Bash-modified files",
    detail: "rm, mv, cp and every other shell command bypass the tracker entirely - only Write, Edit and NotebookEdit tool calls are captured",
  },
  {
    title: "Most subagent edits",
    detail: "a subagent's file changes are usually not restored; only a foreground context: fork skill's edits count as part of your own turn",
  },
  {
    title: "Anything outside this session",
    detail: "manual edits you make yourself, or edits from a concurrent Claude Code session, are invisible to this session's checkpoints",
  },
  {
    title: "Symlinked and hard-linked paths",
    detail: "restore skips them and prints a \"skipped N files\" warning - a dotfile manager's symlinks and pnpm's hard-links both land here",
  },
  {
    title: "Directory structure",
    detail: "creating, moving or deleting a whole directory is not undone by rewinding - only tracked files' contents are",
  },
] as const;

export function CheckpointBlindSpotGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {BLIND_SPOTS.map((item) => (
        <div key={item.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-neutral-400">
            <XIcon />
            <h3 className="text-[15px] font-semibold text-neutral-100">{item.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
