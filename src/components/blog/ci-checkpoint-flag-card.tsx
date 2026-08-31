// The exact claude_args this repo's own seo-daily.yml passes to
// anthropics/claude-code-action for the run that writes and ships this guide
// - read from the workflow file, not assumed. Checkpointing needs either an
// interactive terminal (for /rewind) or an explicit SDK flag; this run has
// neither, which is the whole point of the section it sits in.

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
}

const FLAGS = [
  {
    flag: "--permission-mode bypassPermissions",
    present: true,
    note: "no prompts to answer - nothing in this run waits on a human",
  },
  {
    flag: "--rewind-files <checkpoint-uuid>",
    present: false,
    note: "the CLI flag that triggers an SDK-level file rewind",
  },
  {
    flag: "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING",
    present: false,
    note: "the env var that turns SDK checkpointing on for a headless -p run",
  },
] as const;

export function CiCheckpointFlagCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        .github/workflows/seo-daily.yml - claude_args for this exact run
      </h3>
      <ul className="mt-3 divide-y divide-neutral-800/70">
        {FLAGS.map((f) => (
          <li key={f.flag} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
            <span className={f.present ? "mt-0.5 text-emerald-400" : "mt-0.5 text-neutral-600"}>
              {f.present ? <CheckIcon /> : <XIcon />}
            </span>
            <div>
              <p className="font-mono text-sm text-neutral-100">{f.flag}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{f.note}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Read straight from this repo&apos;s own workflow file: the run building this exact guide has zero
        checkpoint coverage wired in.
      </p>
    </div>
  );
}
