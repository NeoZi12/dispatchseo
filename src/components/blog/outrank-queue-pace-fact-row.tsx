// Every number here came from this project's own MCP tools during the run
// that wrote this guide, not a mockup: track_keywords + get_rankings for the
// tracked position, get_build_brief's pacing block for the cadence, and
// get_site_stats for the Search Console feed.

import { StatRow, BigStatTile } from "@/components/ui";

export function OutrankQueuePaceFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title='"outrank alternative" itself'
          value="Not yet ranked"
          sub="Queued the day this idea was approved - first check outside the top 100"
        />
        <BigStatTile
          title="Guide pace, this account"
          value="1/day cap"
          sub="7 shipped in the last 7 days - a PR each, never an auto-publish"
        />
        <BigStatTile
          title="GSC feed, 28 days"
          value="9,559 impr."
          sub="4 clicks - a 35-day-old domain, before click-through catches up"
        />
      </StatRow>
    </div>
  );
}
