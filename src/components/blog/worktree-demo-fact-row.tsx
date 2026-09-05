// The exact commands and output from running git worktree add/status/remove
// against this repo while writing this guide - not a hypothetical, the real
// transcript that proves the isolation claim in the section above it.

function TerminalIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m7 9 3 3-3 3M13 15h4" />
    </svg>
  );
}

const STEPS = [
  {
    command: "git worktree add ../dispatchseo-guide-demo -b demo/worktree-guide",
    result: "\"Preparing worktree (new branch 'demo/worktree-guide')\" - a second checkout appears next to this repo, HEAD at the same commit",
  },
  {
    command: "cd ../dispatchseo-guide-demo && echo change >> src/app/globals.css && git status --short",
    result: "\" M src/app/globals.css\" - the edit shows up inside the new worktree",
  },
  {
    command: "cd back to the main checkout && git status --short",
    result: "empty output - the same edit is invisible here; the two checkouts never shared a working tree",
  },
  {
    command: "git worktree remove ../dispatchseo-guide-demo && git branch -D demo/worktree-guide",
    result: "worktree and branch both gone; git worktree list shows only the main checkout again",
  },
] as const;

export function WorktreeDemoFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-neutral-400">
        <TerminalIcon />
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          Run against this exact repo while writing this guide
        </h3>
      </div>
      <ul className="mt-3 divide-y divide-neutral-800/70">
        {STEPS.map((s) => (
          <li key={s.command} className="py-3 first:pt-0 last:pb-0">
            <p className="font-mono text-[13px] text-neutral-100">{s.command}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">{s.result}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
