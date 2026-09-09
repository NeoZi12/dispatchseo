// This project's own numbers, pulled from get_domain_rank, get_ai_visibility,
// get_rankings, and get_site_stats while writing this guide - not a vendor
// screenshot. "se ranking alternative" was added to the tracker the day this
// suggestion was approved and hadn't been checked against a live page yet,
// since this guide didn't exist until now.

import { StatRow, BigStatTile } from "@/components/ui";

export function SeRankingOwnAccountFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title='"se ranking alternative" itself'
          value="Not yet ranked"
          sub="Checked weekly since 2026-08-17 - no page existed to rank until this one"
        />
        <BigStatTile
          title="This site's own DR-equivalent"
          value="7"
          sub="11 referring domains, 171 backlinks, spam score 2"
        />
        <BigStatTile
          title="AI-citation rate, all engines"
          value="0%"
          sub="0 of 104 Claude checks, 0 of 64 Google AI Overview checks cited"
        />
      </StatRow>
    </div>
  );
}
