// Real output from unattended-heartbeat.sh (this guide's own tested script),
// run once against a mock payload shaped like a session getting close to a
// wall - not illustrative numbers, the actual stdout captured while writing
// this page.

import { StatRow, BigStatTile } from "@/components/ui";

export function StatuslineTestedRunStats() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Burn rate this run reported"
          value="$4.36/hr"
          sub="computed from cost.total_cost_usd ÷ cost.total_duration_ms, not a flat per-token estimate"
        />
        <BigStatTile
          title="Context used"
          value="88%"
          sub="context_window.used_percentage, the same input-only figure the docs' own bar examples chart"
        />
        <BigStatTile
          title="5-hour window left"
          value="6%"
          sub="100 minus rate_limits.five_hour.used_percentage - the line the script prints in red under 10%"
        />
      </StatRow>
    </div>
  );
}
