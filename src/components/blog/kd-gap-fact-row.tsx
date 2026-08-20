// This project's own DataForSEO account: the actual keyword difficulty behind
// this guide's target versus the obvious broad seed a beginner keyword tool
// would reach for first, plus dispatchseo.com's own authority snapshot - the
// numbers that explain why one term cleared the auto-approve line and the
// other never would.

import { StatRow, BigStatTile } from "@/components/ui";

export function KdGapFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title={'"ubersuggest alternative" (this guide\'s target)'}
          value="KD 9"
          sub="110 searches/mo - clears this project's auto-approve line outright"
        />
        <BigStatTile
          title={'"keyword research tool" (the obvious broad seed)'}
          value="KD 81"
          sub="5,400/mo - pulled from the same account, and what a young site has no path to yet"
        />
        <BigStatTile
          title="dispatchseo.com's own authority"
          value="DR 5"
          sub="6 referring domains, 96 backlinks - the real ceiling a KD-81 term runs into"
        />
      </StatRow>
    </div>
  );
}
