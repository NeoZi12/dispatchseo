// This site's own Search Console numbers for a 28-day window, pulled with
// get_site_stats while writing this guide. Shows what "doing SEO" looks like
// in the data on a young site with no authority - small, and still readable.

import { StatRow, BigStatTile } from "@/components/ui";

export function BeginnerOwnFirstMonthStats() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile title="Impressions, last 28 days" value="186" sub="times dispatchseo.com appeared in Google results" />
        <BigStatTile title="Clicks, last 28 days" value="10" sub="visits that came from those results" />
        <BigStatTile title="Cost of the tool that reported it" value="$0" sub="Google Search Console, read through its own API" />
      </StatRow>
    </div>
  );
}
