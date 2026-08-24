// This exact page's own keyword and this project's own tracked-keyword count,
// pulled from get_rankings and get_site_stats while writing the guide - not a
// mockup. "wincher alternative" was added to the tracker before this draft
// existed and hasn't cracked the top 100 yet, the same honest starting point
// every new page on this site shows.

import { StatRow, BigStatTile } from "@/components/ui";

export function WincherOwnTrackingFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title='"wincher alternative" itself'
          value="Not yet ranked"
          sub="Checked once, 2026-08-18 - outside the top 100 so far"
        />
        <BigStatTile
          title="Keywords tracked, this project"
          value="50"
          sub="Nightly checks, the same cron for every tracked term"
        />
        <BigStatTile
          title="GSC feed, 28 days"
          value="9,528 impr."
          sub="5 clicks - a few-week-old domain, before click-through catches up"
        />
      </StatRow>
    </div>
  );
}
