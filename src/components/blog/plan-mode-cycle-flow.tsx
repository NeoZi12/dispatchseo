// The Shift-Tab cycle into plan mode, then the three-way approval prompt
// Claude Code actually shows once a plan is ready - per
// code.claude.com/docs/en/permission-modes, fetched fresh for this guide.

const STEPS = [
  { label: "Manual mode (the default)", detail: "every edit and most shell commands ask first, one at a time" },
  { label: "Shift-Tab once - Accept edits", detail: "edits run without asking; shell commands can still prompt" },
  { label: "Shift-Tab again - Plan mode", detail: "Claude reads files and runs read-only commands, but no edit reaches disk yet" },
  { label: "Claude presents the finished plan", detail: "three answers: start editing now, start editing and clear the planning context, or keep planning" },
  { label: "Approving exits plan mode", detail: "the session switches to whichever mode that answer implies, and the edits begin - Ctrl+G opens the plan in your editor first if you want to change it by hand" },
] as const;

export function PlanModeCycleFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
