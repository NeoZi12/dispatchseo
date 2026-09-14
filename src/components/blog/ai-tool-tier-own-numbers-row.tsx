// This project's own numbers, pulled from get_domain_rank, get_ai_visibility,
// and get_site_stats during the session that wrote this guide - the same
// "reviewed pipeline" tier described above, checked the same way every
// tracked project on this platform gets checked.

import { StatRow, BigStatTile } from "@/components/ui";

export function AiToolTierOwnNumbersRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="This site's own DR-equivalent"
          value="8"
          sub="12 referring domains, 173 backlinks, spam score 2"
        />
        <BigStatTile
          title="AI-citation rate, all engines"
          value="0%"
          sub="0 of 171 checks cited, across ChatGPT, Claude, and Google AI Overview"
        />
        <BigStatTile
          title="Search Console, last 28 days"
          value="5 clicks"
          sub="1,641 impressions - the normal cold-start curve for a two-month-old domain"
        />
      </StatRow>
    </div>
  );
}
