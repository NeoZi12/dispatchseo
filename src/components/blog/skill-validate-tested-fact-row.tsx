// Actually run building this guide, against three scratch SKILL.md files
// (claude 2.1.263): `claude plugin validate <path>` on a bare skills folder,
// then wrapped in a minimal .claude-plugin/plugin.json, then --strict against
// a skill with no description and one with a made-up tool name. Not the
// docs' claim - what the CLI does.

import { StatRow, BigStatTile } from "@/components/ui";

export function SkillValidateTestedFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Pointed at a bare skills folder"
          value="Fails"
          sub={`"No manifest found... Expected .claude-plugin/marketplace.json or .claude-plugin/plugin.json" - a plain project skill needs no manifest to WORK, but validate needs one to RUN`}
        />
        <BigStatTile
          title="Wrapped in a minimal plugin.json"
          value="Passes"
          sub="Same three skill files, now inside .claude-plugin/plugin.json - exit 0, even with --strict"
        />
        <BigStatTile
          title="Skill with no description, or a made-up tool"
          value="Not flagged"
          sub="--strict still passed clean - validate checks the manifest shape, not whether a SKILL.md will actually fire"
        />
      </StatRow>
    </div>
  );
}
