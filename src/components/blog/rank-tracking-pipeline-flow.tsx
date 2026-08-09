// The real chain of seo-manager MCP tool calls behind rank tracking, with one
// tracked keyword's actual position history (get_rankings, "claude code
// github actions") standing in for the screenshot a vendor page would use -
// noisy, real numbers instead of a staged example.

const STEPS = [
  {
    label: "track_keywords",
    detail: '"claude code github actions" added, volume 880, KD 14',
  },
  {
    label: "nightly SERP check (daily-ranks cron)",
    detail: "position logged automatically - no manual re-check in a browser",
  },
  {
    label: "get_rankings",
    detail: "61 -> 61 -> 66 -> 63 -> 62 -> dropped out of the top 100, five real checks",
  },
  {
    label: "get_site_stats",
    detail: "hourly Search Console pull, joined to the same project",
  },
  {
    label: "propose_suggestion -> approved -> PR -> log_page",
    detail: "a page ships against what the rank history and GSC gaps actually show",
  },
] as const;

export function RankTrackingPipelineFlow() {
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
