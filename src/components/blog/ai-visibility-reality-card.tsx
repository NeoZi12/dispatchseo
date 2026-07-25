// This project's own get_ai_visibility numbers, pulled live during the
// session that wrote this guide - real, unflattering, and the honest
// worked example of what the folded-in model actually shows you at day 11.

import { StatRow, BigStatTile } from "@/components/ui";

export function AiVisibilityRealityCard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          dispatchseo.com, right now
        </h3>
        <div className="mt-3">
          <StatRow cols={2}>
            <BigStatTile
              title="Claude, cited"
              value="0 of 15"
              sub="15 queries checked, 15 got an AI answer - this site named as a source in none"
            />
            <BigStatTile
              title="Google AI Overview, cited"
              value="0 of 9"
              sub="9 of 10 checked queries returned an overview; 0 named dispatchseo.com"
            />
          </StatRow>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          get_ai_visibility, checked 2026-07-25 - a domain 11 days old, not a broken pipeline.
        </p>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          What 0% actually means here
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          <li>Not a tooling failure - has_ai_answer is true on nearly every checked query, so the engines are answering, just not from this site yet.</li>
          <li>The same cold-start curve a brand-new domain rides in ordinary rankings, not a verdict on the model.</li>
          <li>youtube.com, github.com, reddit.com, and medium.com are the domains these exact queries cite instead - a gap list, not just a miss.</li>
        </ul>
      </div>
    </div>
  );
}
