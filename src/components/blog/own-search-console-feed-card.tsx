// This project's own GSC feed, pulled live via get_site_stats during the
// session that wrote this guide - real numbers, not a mocked dashboard. Zero
// clicks on a 25-day-old domain is the honest state, shown as-is rather than
// smoothed into a more flattering stat.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnSearchConsoleFeedCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_site_stats, 27-day window - 25 days into indexing
      </h3>
      <div className="mt-3">
        <StatRow cols={3}>
          <BigStatTile title="Impressions" value="4,098" />
          <BigStatTile title="Clicks" value="0" />
          <BigStatTile title="Window" value="27d" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Pulled live from this project&apos;s own Search Console property, the same feed a bare GSC MCP
        server would return for any query. Impressions arrive before clicks do on every new domain - a
        decision layer that only acts once clicks show up would have nothing to work with for the first
        month.
      </p>
    </div>
  );
}
