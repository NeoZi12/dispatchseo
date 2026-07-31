// This guide's own information-gain asset: real numbers from this project's
// MCP route file, not a generic "state servers have fewer external calls"
// claim. Counted by grepping src/app/api/[transport]/route.ts for
// server.registerTool(...) calls, then reading which ones make an outbound
// fetch (check_serp's SERP provider, suggest_keywords' Google Autocomplete
// call, keyword_ideas' DataForSEO calls) versus which only touch Supabase.

import { StatRow, BigStatTile } from "@/components/ui";

export function McpToolMixScorecard() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Tools registered"
          value="58"
          sub="server.registerTool calls in one route file"
        />
        <BigStatTile
          title="Reach outside the database"
          value="3"
          sub="check_serp, suggest_keywords, keyword_ideas"
        />
        <BigStatTile
          title="Supabase-only"
          value="55"
          sub="read or write this project's own state, nothing else"
        />
      </StatRow>
    </div>
  );
}
