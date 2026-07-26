// The exact MCP call sequence this guide's own build used to claim its
// suggestion before writing anything - the mechanism that stops two cold
// starts from building the same queue item twice. Step labels are the real
// tool names on dispatchseo.com's seo-manager MCP, not a generic diagram.

const STEPS = [
  { label: "get_instructions(workflow: \"build-guide\")", detail: "fetch the current playbook - never trust cached knowledge of the pipeline" },
  { label: "get_suggestions(status: \"approved\", type: \"guide\")", detail: "read the queue fresh - build order, oldest first, front-placed ideas ahead" },
  { label: "update_suggestion(id, status: \"in_progress\")", detail: "claim it - this write is what makes a second concurrent run pick something else" },
  { label: "template -> gate -> draft -> visuals -> humanizer -> verify", detail: "the actual work, unwatched" },
  { label: "update_suggestion(id, status: \"done\", result_pr_url)", detail: "release the claim with proof - a PR link, not just a status flip" },
] as const;

export function ClaimAndBuildFlow() {
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
              <p className="font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
