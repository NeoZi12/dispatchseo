// This project's own get_overview + get_domain_rank snapshot, pulled while
// writing this guide - real numbers from the same queue this article
// describes, not a mockup.

import { StatRow, BigStatTile } from "@/components/ui";

export function SerpstatLoopStatCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_overview + get_domain_rank, 30 days old
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="Guides shipped, this week" value="7" sub="one build slot a day, no dashboard opened" />
          <BigStatTile title="Keywords tracked" value="45" sub="this page's own keyword among them" />
          <BigStatTile title="This keyword" value="110/mo" sub="&quot;serpstat alternative&quot; - tracked before this page existed" />
          <BigStatTile title="Referring domains" value="4" sub="59 backlinks, DR-equivalent 0" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        The first click from Google landed on 2026-08-11 - a month into a domain with no rank-tracker
        dashboard behind it, just the same queue that decided this page was worth building.
      </p>
    </div>
  );
}
