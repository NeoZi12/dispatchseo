// Three real numbers, one per shape this guide covers - not illustrative.
// The Actions-minutes figure is this repo's own seo-dispatch/route.ts comment
// (the guard-and-exit chain it replaced); the team-size and roster figures
// are quoted straight from code.claude.com/docs/en/agent-teams and
// platform.claude.com/docs/en/managed-agents/multiagent-orchestration.

import { StatRow, BigStatTile } from "@/components/ui";

export function OrchestrationScaleFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Actions minutes this repo stopped burning"
          value="~300/mo"
          sub="per installed site, by moving the schedule off GitHub's guard-and-exit cron chain into seo-dispatch's own check"
        />
        <BigStatTile
          title="Claude Code agent teams"
          value="3-5"
          sub="Anthropic's suggested starting team size - no hard cap, but coordination overhead scales with every teammate"
        />
        <BigStatTile
          title="Managed Agents roster ceiling"
          value="20 / 25"
          sub="max unique agents in a coordinator's roster / max concurrent session threads, per the platform docs"
        />
      </StatRow>
    </div>
  );
}
