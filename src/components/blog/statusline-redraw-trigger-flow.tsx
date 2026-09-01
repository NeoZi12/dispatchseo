// Every event that makes Claude Code re-run a statusline script, in the
// order code.claude.com/docs/en/statusline lists them under "How status
// lines work" - the full trigger list, not just "it updates sometimes."

const TRIGGERS = [
  { label: "Session starts (including a resume)", detail: "the one guaranteed first run - everything after this is event-driven" },
  { label: "A new assistant message arrives", detail: "the most frequent trigger during an active back-and-forth" },
  { label: "/compact finishes", detail: "context_window.current_usage goes null until the next API call repopulates it" },
  { label: "The permission mode changes", detail: "plan ↔ execute, accept-edits, bypass - the flip fires a redraw, the mode itself still isn't a field" },
  { label: "Vim mode toggles", detail: "only relevant when vim mode is enabled at all" },
  { label: "The statusLine command itself changes", detail: "skips the 300ms debounce and runs the new command immediately" },
  { label: "A refreshInterval timer elapses", detail: "opt-in, minimum 1 second - the only trigger that fires with nothing else happening" },
  { label: "A rate-limit window or warm prompt cache hits its own resets_at / expires_at", detail: "the last data the script saw carries its own clock, and Claude Code honors it" },
] as const;

export function StatuslineRedrawTriggerFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {TRIGGERS.map((t, i) => {
        const last = i === TRIGGERS.length - 1;
        return (
          <li key={t.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{t.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{t.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
