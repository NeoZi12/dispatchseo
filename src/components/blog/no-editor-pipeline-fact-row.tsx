// This project's own real numbers, not an illustrative claim: a plain count
// of src/content/blog entries (get_pages) and this project's pacing verdict
// (get_build_brief) during the session that wrote this guide - every one of
// those pages shipped as a PR from this pipeline, none through a
// content-scoring editor.

import { StatRow, BigStatTile } from "@/components/ui";

export function NoEditorPipelineFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Guides already shipped as pull requests"
          value="19"
          sub="src/content/blog, this project's own repo - counted via get_pages, not asserted"
        />
        <BigStatTile
          title="Days since this site's first guide"
          value="20"
          sub="one guide per day is the pace cap, held since day one"
        />
        <BigStatTile
          title="Of those went through a scoring editor first"
          value="0"
          sub="no NeuronWriter, Clearscope, Frase, MarketMuse, or Surfer step in this pipeline, ever"
        />
      </StatRow>
    </div>
  );
}
