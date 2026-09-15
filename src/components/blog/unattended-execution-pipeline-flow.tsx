// The one pipeline both tools actually implement, step by step, with the
// real flag each one uses at each stage - checked against Claude Code's own
// --help output and code.claude.com/docs/en/headless plus OpenAI's
// developers.openai.com/codex CLI reference and agent-approvals-security
// pages during the session that wrote this guide.

const STEPS = [
  {
    label: "A script calls a dedicated non-interactive entrypoint",
    detail: "claude -p \"prompt\" and codex exec \"prompt\" both exist as their own mode, not a flag bolted onto the interactive one.",
  },
  {
    label: "The OS sandbox intercepts every file and network call",
    detail: "Claude Code's Bash sandbox and Codex's --sandbox flag both resolve to the same primitive: Seatbelt on macOS, bubblewrap on Linux and WSL2.",
  },
  {
    label: "An approval policy decides what still needs a person",
    detail: "--permission-prompts none (Claude Code) and --ask-for-approval never (Codex) both mean: deny anything that would have paused for a human, don't wait.",
  },
  {
    label: "The command runs inside the boundary, or gets refused before it starts",
    detail: "workspace-write and acceptEdits-class modes let file edits through; danger-full-access and bypassPermissions turn the boundary off, and both vendors' docs say only do that in an already-isolated runner.",
  },
  {
    label: "The result comes back in a shape a script can grep",
    detail: "Claude Code's is_error field mirrors its process exit code; Codex exits non-zero the same way - both explicit enough to gate a CI step on, neither requiring you to parse prose.",
  },
] as const;

export function UnattendedExecutionPipelineFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-xs font-medium tabular-nums text-amber-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
