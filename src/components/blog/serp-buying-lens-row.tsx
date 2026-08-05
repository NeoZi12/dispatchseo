// Today's live "best seo automation software" page 1, counted by what each
// result actually is - not summarized from memory. Positions 1 and 10 were an
// ad and a video/PAA block, not organic omissions; fetched via check_serp
// during the session that wrote this guide.

import { StatRow, BigStatTile } from "@/components/ui";

export function SerpBuyingLensRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Of 8 organic results, are roundups"
          value="6"
          sub="marketermilk, eesel, morningscore, wpseoai, thestacc, zapier - all rounding up other vendors' tools"
        />
        <BigStatTile
          title="Is a recognizable enterprise brand"
          value="1"
          sub="Siteimprove - everything else is a small-to-mid vendor blog or product page"
        />
        <BigStatTile
          title="Names a self-hosted, one-founder option"
          value="0"
          sub="every result is scored for a buyer choosing software to run on someone else's site"
        />
      </StatRow>
    </div>
  );
}
