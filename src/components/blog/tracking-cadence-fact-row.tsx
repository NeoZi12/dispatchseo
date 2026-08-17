// This exact page's own keyword, pulled from get_rankings while writing the
// guide - not a mockup. AccuRanker advertises "insights in seconds"; this
// project's honest cadence is one nightly check per keyword, which is the
// real scope trade the rest of the guide argues, shown as a fact instead of
// asserted in prose.

import { StatRow, BigStatTile } from "@/components/ui";

export function TrackingCadenceFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title='"accuranker alternative" itself'
          value="Not yet ranked"
          sub="Checked once, 2026-08-11 - outside the top 100 so far"
        />
        <BigStatTile
          title="Check cadence"
          value="1/night"
          sub={'vs AccuRanker\'s advertised "insights in just seconds"'}
        />
        <BigStatTile
          title="GSC feed, 28 days"
          value="6,202 impr."
          sub="1 click - a 31-day-old domain, before the click-through catches up"
        />
      </StatRow>
    </div>
  );
}
