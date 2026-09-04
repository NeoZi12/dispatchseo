// How Claude Code actually resolves a tool call against permissions.allow/ask/deny,
// per code.claude.com/docs/en/permissions: "Rules are evaluated in order: deny,
// then ask, then allow. The first match in that order determines the outcome,
// and rule specificity doesn't change the order." The aws example is the
// docs' own: a broad Bash(aws *) deny still wins over a narrower, more
// specific Bash(aws s3 ls) allow sitting right next to it.

const STEPS = [
  { label: "Claude proposes a call", detail: "e.g. Bash(aws s3 ls) - narrow, and clearly read-only" },
  { label: "Deny rules are checked first", detail: "a broader Bash(aws *) deny matches too, and it wins outright - specificity never breaks the tie" },
  { label: "Ask rules are checked next", detail: "a matching ask rule still forces a prompt, even when a more specific allow rule matches the same call" },
  { label: "Only then do allow rules get a turn", detail: "the call runs without a prompt - but only because nothing above it matched first" },
  { label: "Nothing matches at all", detail: "falls through to whatever the active permission mode does by default for that tool type" },
] as const;

export function RulePrecedenceFlow() {
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
