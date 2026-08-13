// The real chain of seo-manager MCP tool calls between a backlink signal and
// a shipped page. Step 2's count is this project's actual, honest state at
// writing time - get_backlink_prospects returned zero rows because
// prospecting hasn't run for this project yet, not a staged number.

const STEPS = [
  {
    label: "get_domain_rank",
    detail: "this project's own DataForSEO account - referring domains, backlinks, spam score",
  },
  {
    label: "get_backlink_prospects",
    detail: "0 rows right now - prospecting hasn't run for this project yet, shown honestly rather than staged",
  },
  {
    label: "propose_suggestion",
    detail: "a content gap the signal points at becomes a queued idea, not a spreadsheet row",
  },
  {
    label: "update_suggestion(approved) -> PR",
    detail: "the idea ships as a guide or a free tool, reviewed and merged like any other change",
  },
  {
    label: "log_page -> next daily-ranks cron",
    detail: "the new page's own position starts getting tracked the following night",
  },
] as const;

export function BacklinkToPlanFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-xs font-medium tabular-nums text-fuchsia-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
