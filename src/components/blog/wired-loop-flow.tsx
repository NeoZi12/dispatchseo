// The real chain of seo-manager MCP tool calls (src/app/api/[transport]/route.ts)
// that replaces the seven-tab stack in <FreeStackTable /> - actual registered
// tool names, not a generic "research, write, publish" diagram.

const STEPS = [
  {
    label: "suggest_keywords + check_serp",
    detail: "keyword ideas and a live SERP read, in the same session - no tab switch",
  },
  {
    label: "track_keywords -> get_rankings",
    detail: "daily position history, queryable any time - not a manual re-check in a browser",
  },
  {
    label: "get_site_stats",
    detail: "hourly Search Console pulls, already joined to the same project as everything above",
  },
  {
    label: "propose_suggestion",
    detail: "the keyword, its volume/KD, and a plain-text rationale, written to one queue",
  },
  {
    label: 'update_suggestion(status: "approved")',
    detail: "the owner's call, or the build-first policy for guides inside the auto-approve zone",
  },
  {
    label: "PR labeled seo -> merge -> log_page",
    detail: "the guide ships, and the next run knows it exists - nothing re-proposes it",
  },
] as const;

export function WiredLoopFlow() {
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
              <p className="font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
