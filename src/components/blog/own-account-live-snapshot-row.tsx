// Every number here came back from this project's own MCP tools in the same
// session that wrote this guide - get_domain_rank, get_ai_visibility, the
// build brief's site_stats, and get_rankings on this article's own target
// keyword. Nothing simulated: a 24-day-old site has a 0 DR-equivalent and a
// 0% AI-citation rate, and that's the honest, unglamorous state SERPWatcher
// or AI Search Watcher would show for any account this young too.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnAccountLiveSnapshotRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, pulled live while writing this guide - 24 days old
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="DR-equivalent" value="0" sub="2 referring domains, 59 backlinks" />
          <BigStatTile title="AI-citation rate" value="0%" sub="0 of 97 checks across ChatGPT, Claude, Google AI Overview" />
          <BigStatTile title="GSC impressions" value="3,892" sub="0 clicks, last 26 days" />
          <BigStatTile title="This keyword, tracked" value="2 checks" sub="“mangools alternative” - no rank yet, page didn't exist" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        SiteProfiler, AI Search Watcher, and SERPWatcher would report the same kind of numbers for an
        account this new - the difference isn't the numbers, it's that nothing here required opening a
        dashboard to go get them.
      </p>
    </div>
  );
}
