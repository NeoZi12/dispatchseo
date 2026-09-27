// The five decisions a headless run's environment actually needs made, not
// the full 60+ row reference at code.claude.com/docs/en/env-vars - narrowed to
// what changes behavior when nobody's there to notice it went wrong.

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
    title: "Auth: exactly one var set, not zero",
    detail:
      "ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or CLAUDE_CODE_OAUTH_TOKEN - once there's no browser to complete an interactive login, one of these three is the only way in.",
  },
  {
    title: "Model pinned, not defaulted",
    detail:
      "ANTHROPIC_MODEL (or ANTHROPIC_DEFAULT_MODEL) set explicitly, or a scheduled job silently rides whatever Anthropic's own default becomes next.",
  },
  {
    title: "A ceiling on every long-running command",
    detail:
      "BASH_DEFAULT_TIMEOUT_MS and BASH_MAX_TIMEOUT_MS set below the job's own timeout-minutes, so Claude Code kills a hanging command before the runner kills the whole job.",
  },
  {
    title: "A ceiling on output, not just time",
    detail:
      "BASH_MAX_OUTPUT_LENGTH capped so one verbose command doesn't fill the run's log - and the model's context - with noise instead of signal.",
  },
  {
    title: "Telemetry decided on purpose",
    detail:
      "DISABLE_TELEMETRY and DISABLE_ERROR_REPORTING set deliberately either way, rather than left to whatever the runner image happens to ship with.",
  },
] as const;

export function EnvVarCategoryChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-amber-300">
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
