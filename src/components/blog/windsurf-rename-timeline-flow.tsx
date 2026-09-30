// The three dated changes that decide what "Windsurf" even means for an
// unattended run: the local agent (April 29, 2026), the terminal CLI (same
// day) and the rename to Devin Desktop (June 2, 2026). Dates and versions
// are from the Devin Desktop changelog (docs.devin.ai/desktop/changelog),
// read during the session that wrote this guide.

const STEPS = [
  { date: "Apr 29, 2026", label: "Devin Local agent, v2.1.29", detail: "a new local agent next to the legacy Cascade one, billed as up to 30% more token-efficient" },
  { date: "Apr 29, 2026", label: "Devin for Terminal (CLI), v2.1.29", detail: "a CLI agent on your machine, with hand-off to a cloud session - the piece a script can call" },
  { date: "Jun 2, 2026", label: "Windsurf becomes Devin Desktop, v3.0.12", detail: "the editor keeps its code, loses its name - docs.windsurf.com now redirects to docs.devin.ai" },
] as const;

export function WindsurfRenameTimelineFlow() {
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
              <p className="text-xs uppercase tracking-wide text-neutral-500">{s.date}</p>
              <p className="mt-0.5 font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
