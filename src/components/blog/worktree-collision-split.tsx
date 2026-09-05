// One shared directory vs. one worktree per session - the actual mechanical
// difference per code.claude.com/docs/en/worktrees ("A git worktree is a
// separate working directory with its own files and branch, sharing the same
// repository history and remote as your main checkout"), not a metaphor.

function WarningIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M12 4 2 20h20L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}

function SplitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path d="M12 3v6M12 21v-6M6 9l6-6 6 6M6 15l6 6 6-6" />
    </svg>
  );
}

const COLLIDES = [
  { title: "Same working tree, both sessions", detail: "session B's checkout is the exact directory session A is mid-edit in - there's only one copy of every file on disk" },
  { title: "git status shows both sets of changes", detail: "whichever session runs it sees its own edits mixed with the other session's, with no way to tell which is which" },
  { title: "A build one session kicks off reads the other's half-written files", detail: "tests, lints, and builds all read the same tree the other session is still writing to" },
];

const ISOLATED = [
  { title: "Separate directory, separate branch, per worktree", detail: "each session's edits land in its own checkout - a second copy of the working tree, not a second view of the same one" },
  { title: "History, remotes, and .git stay shared", detail: "nothing to sync manually - commits made in one worktree are visible to git in every other, same repository" },
  { title: "A build in one worktree can't see the other's uncommitted files", detail: "tests and builds read only the checkout they were started in" },
];

export function WorktreeCollisionSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-amber-300">
          <WarningIcon />
          <h3 className="text-sm font-semibold">One directory, two sessions</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {COLLIDES.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-emerald-400">
          <SplitIcon />
          <h3 className="text-sm font-semibold">One repo, one worktree per session</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {ISOLATED.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
