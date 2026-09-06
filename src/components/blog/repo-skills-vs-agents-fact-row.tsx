// This exact repo, checked live for this guide's own build:
// `find .claude/agents` and `ls .claude/commands` - not illustrative counts.

import { StatRow, BigStatTile } from "@/components/ui";

export function RepoSkillsVsAgentsFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Checked-in skills, this repo"
          value="6"
          sub=".claude/commands/*.md - seo-research, seo-build, seo-build-tool, seo-report, seo-backlinks, seo-setup"
        />
        <BigStatTile
          title="Checked-in custom subagents"
          value="0"
          sub="no .claude/agents/ directory exists in this repo at all"
        />
        <BigStatTile
          title="Subagents used to build this guide"
          value="0 required"
          sub="Explore and general-purpose spin up on request with no file to author or maintain"
        />
      </StatRow>
    </div>
  );
}
