// This site's own Search Console numbers for a 28-day window (get_site_stats
// while writing this guide): what the $0 tier actually reports on a young site.

import { StatRow, BigStatTile } from "@/components/ui";

export function SmallBusinessFreeTierReachStats() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile title="Impressions, 28 days" value="202" sub="times dispatchseo.com showed in Google results" />
        <BigStatTile title="Clicks, 28 days" value="10" sub="visits that came from those results" />
        <BigStatTile title="Spent on SEO tools" value="$0" sub="Search Console reported all of it" />
      </StatRow>
    </div>
  );
}
