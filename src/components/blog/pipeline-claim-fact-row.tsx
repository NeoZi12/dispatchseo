// Real numbers from the session that wrote this exact guide, not illustrative
// ones: this suggestion's own created_at/started_at timestamps from the
// seo-manager MCP, and a plain count of the tool calls this run actually made
// before drafting a sentence.

import { StatRow, BigStatTile } from "@/components/ui";

export function PipelineClaimFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Days this idea waited in queue"
          value="~5.9"
          sub="created_at 2026-07-20 to started_at 2026-07-26, this exact suggestion row"
        />
        <BigStatTile
          title="MCP calls before a word was drafted"
          value="7"
          sub="get_instructions, get_project, get_suggestions, update_suggestion(in_progress), get_pages, check_serp, get_site_stats"
        />
        <BigStatTile
          title="Approved guides to choose between"
          value="1"
          sub="no re-ranking - build order was already exactly one item deep"
        />
      </StatRow>
    </div>
  );
}
