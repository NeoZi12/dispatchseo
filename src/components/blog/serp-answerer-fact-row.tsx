// The live page-1 organic results for "can i do seo on my own", pulled via
// check_serp during the session that wrote this guide - counted by whether
// the result actually answers the question or is someone else asking it.

import { StatRow, BigStatTile } from "@/components/ui";

export function SerpAnswererFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        check_serp, &quot;can i do seo on my own&quot;, page 1
      </h3>
      <div className="mt-3">
        <StatRow cols={3}>
          <BigStatTile
            title="Asking, not answering"
            value="3 / 7"
            sub="r/SEO, r/photography, and a Quora thread - people posing this exact question to strangers"
          />
          <BigStatTile
            title="Actually say yes and explain how"
            value="2 / 7"
            sub="etchedmarketing.com and contractorgrowthnetwork.com, both small independent sites"
          />
          <BigStatTile
            title="Generic reference, no verdict"
            value="2 / 7"
            sub="Google&apos;s own starter guide and a beginner DIY walkthrough - neither takes a side"
          />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Nobody ranking for this query at a recognized-brand level has committed to a direct answer -
        the closest thing to authority on page one is Google&apos;s own starter guide, which does not
        address the DIY-vs-hire question at all.
      </p>
    </div>
  );
}
