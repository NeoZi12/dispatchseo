// Real numbers pulled from dispatchseo.com's own MCP route file, not a
// generic "MCP servers can have many tools" claim - counted with grep against
// src/app/api/[transport]/route.ts at the time this guide was written.

import { StatRow, BigStatTile } from "@/components/ui";

export function McpFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Tools registered"
          value="44"
          sub="server.registerTool calls in one route file"
        />
        <BigStatTile
          title="Lib modules wired in"
          value="29"
          sub="distinct @/lib imports the route depends on"
        />
        <BigStatTile
          title="Auth gates"
          value="1"
          sub="the same check runs in front of all 44 tools"
        />
      </StatRow>
    </div>
  );
}
