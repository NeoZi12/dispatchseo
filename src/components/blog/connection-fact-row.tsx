// Real numbers from the session that wrote this guide, not illustrative
// ones: dispatchseo.com's own daily builder connects over .github/mcp-ci.json
// (checked into this repo) via the --mcp-config flag, and `claude mcp list`
// run fresh in that same environment reported zero servers - the flag
// connects a session without ever touching claude mcp add or ~/.claude.json.

import { StatRow, BigStatTile } from "@/components/ui";

export function ConnectionFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Transports in one config file"
          value="2"
          sub="HTTP for the seo-manager server, stdio for dataforseo"
        />
        <BigStatTile
          title="Flag that loaded both"
          value="1"
          sub="--mcp-config <file>, pointed at a committed JSON file"
        />
        <BigStatTile
          title="Servers claude mcp list showed after"
          value="0"
          sub="a --mcp-config server never touches ~/.claude.json"
        />
      </StatRow>
    </div>
  );
}
