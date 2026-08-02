// The real timeline behind THIS guide, pulled from this project's own
// get_trend_topics and get_suggestions timestamps - not a hypothetical
// pipeline diagram, the actual dates this exact page took to ship.

const STEPS = [
  {
    label: "2026-07-17 - trend radar flags it",
    detail:
      "a Search Engine Land story on AI search reviving old, already-resolved bad press lands on this project's own trend radar - a signal, not yet an idea",
  },
  {
    label: "2026-07-29 - research run proposes this guide",
    detail:
      'get_suggestions queues "content freshness seo" (KD 6, 50 searches/mo), citing that same radar signal in its rationale',
  },
  {
    label: "2026-07-29 - build-first auto-approval, same session",
    detail:
      "this project's queue policy approves guide ideas inside the auto-approve zone the moment they're proposed - no separate review step",
  },
  {
    label: "2026-08-02 - waits for a free daily slot",
    detail:
      "one guide ships per day, whoever ships it; 5 guides went out in the 7 days before this one, so the idea queued behind the pace cap, not behind a person",
  },
  {
    label: "2026-08-02 - this guide builds and ships",
    detail: "16 days, radar signal to published page - the number the rest of this article is arguing for",
  },
] as const;

export function TrendToGuideTimelineFlow() {
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
