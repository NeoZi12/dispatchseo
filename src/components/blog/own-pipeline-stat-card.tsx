// This project's own get_overview snapshot, pulled live while writing this
// guide - the seed-to-tracked-page loop the article describes, shown running
// at its own real scale instead of asserted in prose.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnPipelineStatCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_overview, 29 days old
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="Guides shipped, this week" value="7" sub="one build slot a day, never skipped" />
          <BigStatTile title="Keywords tracked" value="45" sub="every one queued the same way this page was" />
          <BigStatTile title="In the top 100" value="2" sub="most still too young to rank at all" />
          <BigStatTile title="This keyword" value="170/mo" sub="&quot;answerthepublic alternative&quot; - tracked before this page existed" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Every number above came from this project&apos;s own queue and rank history, not a mockup - the
        same loop this guide walks through, already running on 45 other keywords besides its own.
      </p>
    </div>
  );
}
