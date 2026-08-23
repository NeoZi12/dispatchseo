// This project's own get_ai_visibility numbers, pulled live while writing
// this guide (2026-08-23). One of the logged queries is close enough to this
// exact keyword to quote directly: Claude was asked "Are there any free
// MarketMuse alternatives?" on 2026-08-19 and named seven sources - this site
// wasn't yet one of them, which is the honest starting point for a domain
// this young, not a broken pipeline.

import { StatRow, BigStatTile } from "@/components/ui";

const CITED_INSTEAD = [
  "capterra.com",
  "alexbirkett.com",
  "madx.digital",
  "itqlick.com",
  "xseek.io",
  "themarketingagency.ca",
  "getspike.ai",
];

export function MarketmuseCitationGapFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={2}>
        <BigStatTile
          title="This project, cited across every AI engine checked"
          value="0 of 134"
          sub="ChatGPT, Claude, and Google AI Overview combined - get_ai_visibility, this run"
        />
        <BigStatTile
          title="Asked directly: 'free MarketMuse alternatives?'"
          value="7 sources, 0 this site"
          sub="Claude's answer on 2026-08-19 - the seven domains below, not this one"
        />
      </StatRow>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CITED_INSTEAD.map((d) => (
          <span key={d} className="rounded-full bg-neutral-800 px-2.5 py-1 text-xs text-neutral-400">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}
