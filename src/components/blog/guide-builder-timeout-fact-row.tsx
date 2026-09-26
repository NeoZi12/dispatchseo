// The exact timeout config on the workflow that builds this site's own
// guides (.github/workflows/seo-daily.yml, read fresh for this guide) -
// three independent ceilings stacked on one Claude Code run, not a
// hypothetical setup.

import { StatRow, BigStatTile } from "@/components/ui";

export function GuideBuilderTimeoutFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="MCP_TIMEOUT"
          value="120000 ms"
          sub="Set on this exact workflow's Claude step, in .github/workflows/seo-daily.yml"
        />
        <BigStatTile
          title="--max-turns"
          value="150"
          sub="This run's own in-process ceiling - Claude Code has no other turn budget flag"
        />
        <BigStatTile
          title="job timeout-minutes"
          value="45"
          sub="The outer GitHub Actions ceiling, for when the process itself never returns"
        />
      </StatRow>
    </div>
  );
}
