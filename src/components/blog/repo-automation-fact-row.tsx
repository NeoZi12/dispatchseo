// This repo's own automation surface, counted with real commands during the
// session that wrote this guide - not a marketing claim:
//   grep -c "server.registerTool(" "src/app/api/[transport]/route.ts"  -> 61
//   ls -d src/app/api/cron/*/ | wc -l                                  -> 7
//   ls supabase/migrations/ | wc -l                                    -> 51

import { StatRow, BigStatTile } from "@/components/ui";

export function RepoAutomationFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="MCP tools registered"
          value="61"
          sub="grep -c against this repo's own route file, run for this guide"
        />
        <BigStatTile
          title="Cron endpoints"
          value="7"
          sub="daily-ranks, hourly-gsc, weekly-opportunities, serp-collect, seo-dispatch, heartbeat, deploy-check"
        />
        <BigStatTile
          title="Schema migrations"
          value="51"
          sub="additive, zero-downtime - this repo's whole operational history"
        />
      </StatRow>
    </div>
  );
}
