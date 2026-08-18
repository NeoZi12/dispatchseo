// Real output from src/lib/keyword-clustering.ts, run against a 10-keyword
// test list while writing this guide (node --experimental-strip-types) - not
// a mockup. None of the four clusters it found crossed the same-page bar,
// which is the honest, unglamorous shape of what this algorithm actually
// does on a mixed list, shown as a fact instead of asserted in prose.

import { StatRow, BigStatTile } from "@/components/ui";

export function ClusterRunOutputCard() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile title="10 keywords in" value="4 clusters out" sub="2 multi-keyword groups, 2 standalone" />
        <BigStatTile title="Largest cluster" value="6 keywords" sub={'"sections" verdict - 0.30 avg overlap'} />
        <BigStatTile title="Same-page bar" value="0.60 similarity" sub="Nothing in this run crossed it" />
      </StatRow>
    </div>
  );
}
