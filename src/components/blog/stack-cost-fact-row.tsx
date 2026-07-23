// Semrush's real current entry price, fetched live from semrush.com/prices
// during the session that wrote this guide (several page-1 posts still quote
// an older $139.95 figure) - set against the actual login count the free
// stack in <FreeStackTable /> requires, versus this project's own single
// bearer token.

import { StatRow, BigStatTile } from "@/components/ui";

export function StackCostFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Semrush, entry tier"
          value="$117.33/mo"
          sub="SEO plan, billed annually (semrush.com/prices) - no permanent free plan, only a 7-day trial"
        />
        <BigStatTile
          title="Free stack, logins required"
          value="7"
          sub="GSC, Keyword Planner, Ahrefs Webmaster Tools, Mangools, Ubersuggest, Trends, Answer Socrates"
        />
        <BigStatTile
          title="DispatchSEO, logins required"
          value="1"
          sub="one bearer token behind get_rankings, get_site_stats, suggest_keywords, and the rest"
        />
      </StatRow>
    </div>
  );
}
