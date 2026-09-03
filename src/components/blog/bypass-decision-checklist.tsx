// The three preconditions that have to hold AT ONCE for
// --dangerously-skip-permissions to be a reasonable call, drawn from Claude
// Code's own "Common setups" guidance (isolation needed for a fully
// unattended run) plus its bypassPermissions warning that the mode offers no
// protection of its own against prompt injection or unintended actions.

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const PRECONDITIONS = [
  {
    title: "A real isolation boundary already wraps the whole process",
    detail: "a container, VM, or the sandbox runtime - not just the Bash-only /sandbox, which never covers Edit/Write, MCP servers, or hooks",
  },
  {
    title: "Nothing sensitive is reachable from inside that boundary",
    detail: "no live credentials, no other tenant's data, no mounted host path worth stealing or destroying if the run goes wrong",
  },
  {
    title: "An independent gate reviews what the run produces",
    detail: "a pull request and required CI checks, never a direct push - the check that catches what got past everything upstream of it",
  },
] as const;

export function BypassDecisionChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {PRECONDITIONS.map((item) => (
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
