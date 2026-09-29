// The "no news is a failure" thresholds this backend's own dashboard uses,
// read from STALE_HOURS in src/lib/cron-alerts.ts: how long a job may go
// without reporting before Home flags it. Real values from the source, not
// illustrations.

import { StatRow, BigStatTile } from "@/components/ui";

export function RunHeartbeatStaleHoursRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={4}>
        <BigStatTile title="jobs (queue drain)" value="6h" sub="Runs every 10 minutes; idle ticks don't advance the clock" />
        <BigStatTile title="seo-dispatch" value="10h" sub="Every 3 hours - roughly 3x its cadence" />
        <BigStatTile title="daily-ranks" value="36h" sub="One run a day plus a day and a half of slack" />
        <BigStatTile title="Any claimed job" value="36h" sub="Backstop when work was handed out and never finished" />
      </StatRow>
    </div>
  );
}
