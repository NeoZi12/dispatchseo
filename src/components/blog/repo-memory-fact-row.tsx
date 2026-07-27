// Real measurements of this repo's own memory files, taken by running wc
// against them during this guide's own build - not illustrative numbers.

import { StatRow, BigStatTile } from "@/components/ui";

export function RepoMemoryFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="This repo's root CLAUDE.md"
          value="207 lines"
          sub="wc -l CLAUDE.md, run for this guide - 10 top-level sections, 12,075 bytes"
        />
        <BigStatTile
          title="Claude Code's own adherence guidance"
          value="200 lines"
          sub="the docs' target ceiling before instructions get followed less reliably"
        />
        <BigStatTile
          title="A second always-loaded file, same repo"
          value="90 lines"
          sub=".dispatchseo/conventions.md - site facts read by the SEO workflow, layered above CLAUDE.md"
        />
      </StatRow>
    </div>
  );
}
