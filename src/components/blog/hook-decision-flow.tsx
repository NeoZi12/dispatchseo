// What actually happens to one PreToolUse hook's exit code and stdout, per
// code.claude.com/docs/en/hooks - the path most guides gloss over as "exit 2
// blocks it" without covering the JSON branch or the multi-hook merge rule.

const STEPS = [
  { label: "Claude calls a tool", detail: "PreToolUse fires first, before the tool runs" },
  { label: "Every matching hook runs, in parallel", detail: "scoped by the matcher (tool name); all run to completion even if one denies" },
  { label: "Exit 0, plain stdout", detail: "no objection reported - the normal permission flow still applies" },
  { label: "Exit 2", detail: "the tool call is blocked outright; stderr text becomes Claude's feedback" },
  { label: "Exit 0 + JSON permissionDecision", detail: "\"allow\" skips the prompt, \"deny\" cancels with a reason, \"ask\" shows the normal prompt" },
  { label: "Hooks disagree? Most restrictive wins", detail: "order is deny, defer, ask, allow - one denying hook overrides a sibling's allow" },
] as const;

export function HookDecisionFlow() {
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
