// The four checks Claude Code runs against every tool call while a session
// is isolated in a worktree, per the "How Claude Code enforces isolation"
// section of code.claude.com/docs/en/worktrees - not a general description of
// what worktrees are, the specific things a --worktree session is blocked
// from doing to the main checkout.

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 3 4 6v6c0 4.5 3.4 7.4 8 9 4.6-1.6 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const CHECKS = [
  {
    title: "File edits",
    detail: "an Edit, Write, or NotebookEdit call targeting a path in the main checkout is blocked outright",
  },
  {
    title: "Command working directory",
    detail: "a Bash, PowerShell, or Monitor command whose working directory resolves to the main checkout - or can't be verified as staying outside it - is blocked",
  },
  {
    title: "Git redirects",
    detail: "a command that redirects git into the main checkout is blocked, whether through git -C, --git-dir, a GIT_DIR/GIT_WORK_TREE variable, or a cd into it before running git",
  },
  {
    title: "Command shape",
    detail: "a command is blocked when Claude Code can't verify from its text that any git it runs stays inside the worktree - a computed command name or unparseable syntax counts; this check can't be turned off",
  },
] as const;

export function WorktreeEnforcementGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CHECKS.map((item) => (
        <div key={item.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            <ShieldIcon />
            <h3 className="text-[15px] font-semibold text-neutral-100">{item.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}
