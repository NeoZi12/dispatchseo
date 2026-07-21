// Real numbers from this guide's own build, not illustrative ones: the tool
// count comes from `grep -c 'server.registerTool(' src/app/api/[transport]/
// route.ts` run against this repo during the session that wrote this page.

import { StatRow, BigStatTile } from "@/components/ui";

export function AgentStackFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="MCP tools this agent runs on"
          value="46"
          sub="grep -c server.registerTool( against this repo's own route file"
        />
        <BigStatTile
          title="Accounts the agent runs in"
          value="3"
          sub="your own Vercel + Supabase + GitHub, never a shared vendor cluster"
        />
        <BigStatTile
          title="Per-seat fee for this agent"
          value="$0"
          sub="billed through the Claude subscription you already pay for"
        />
      </StatRow>
    </div>
  );
}
