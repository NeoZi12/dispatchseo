// Real numbers from this repo, measured on 2026-10-03: `gh pr list --state
// merged --label seo --limit 300` (75 PRs; median of mergedAt - createdAt is
// 2.2 minutes), plus the builder workflow's own settings in
// .github/workflows/seo-daily.yml (timeout-minutes: 45, --max-turns 150) and
// the dispatcher's `41 */3 * * *` schedule.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnLoopRunStats() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={4}>
        <BigStatTile title="Agent PRs merged" value="75" sub="label seo, as of 2026-10-03" />
        <BigStatTile title="Median open to merge" value="2.2 min" sub="from gh createdAt and mergedAt" />
        <BigStatTile title="Job ceiling" value="45 min" sub="timeout-minutes on the builder" />
        <BigStatTile title="Turn ceiling" value="150" sub="--max-turns on the builder" />
      </StatRow>
    </div>
  );
}
