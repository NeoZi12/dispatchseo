// Real Search Console + rank-tracking numbers pulled from this project's own
// get_site_stats/get_rankings during the session that wrote this page - the
// honest, unflattering answer to "does an AI SEO agent's own output rank."

import { StatRow, BigStatTile } from "@/components/ui";

export function SeoAgentRealityFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Days this domain has existed"
          value="8"
          sub="get_project.created_at - no backlink history, no domain authority yet"
        />
        <BigStatTile
          title="Search Console impressions, last 7 days"
          value="59"
          sub="get_site_stats - 0 clicks so far across the whole domain"
        />
        <BigStatTile
          title="Best live position, own target keyword"
          value="63"
          sub={'get_rankings - "claude code github actions" (KD 14), 3 days after publish'}
        />
      </StatRow>
    </div>
  );
}
