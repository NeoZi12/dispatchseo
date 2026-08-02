// Ahrefs' own December 2025 study (17M AI citations analyzed), fetched and
// verified against ahrefs.com/blog/fresh-content/ while writing this guide -
// the real numbers behind the claim that AI engines punish old content harder
// than Google ever did.

import { StatRow, BigStatTile } from "@/components/ui";

export function AiCitationFreshnessFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="How much fresher AI citations run"
          value="25.7%"
          sub="younger than organic Google results, across 17M citations - Ahrefs, published 2025-12-22"
        />
        <BigStatTile
          title="ChatGPT's own gap vs Google's results"
          value="393-458 days"
          sub="newer on average than the organic result for the same query - the widest gap Ahrefs measured"
        />
        <BigStatTile
          title="Which engine tolerates old sources longest"
          value="AI Overviews"
          sub="Google's own AI Overviews cite comparatively older content than ChatGPT - slower to punish age, not immune to it"
        />
      </StatRow>
    </div>
  );
}
