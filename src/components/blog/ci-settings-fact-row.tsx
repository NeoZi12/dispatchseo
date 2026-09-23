// This repo's actual guide-builder step, read straight from
// .github/workflows/seo-daily.yml rather than described from memory: no
// .claude/settings.json is checked in at all, because the one mode this
// pipeline needs - bypassPermissions - is a mode a committed project file
// can't set in the first place (code.claude.com/docs/en/settings: "auto and
// bypassPermissions don't take effect from project or local settings").

import { StatRow, BigStatTile } from "@/components/ui";

export function CiSettingsFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        .github/workflows/seo-daily.yml, this repo, read while writing this guide
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile
            title="Committed settings.json"
            value="none"
            sub="the mode this run needs can't be granted by one anyway"
          />
          <BigStatTile
            title="Permission mode"
            value="--permission-mode"
            sub="bypassPermissions, passed fresh on the command line every run"
          />
          <BigStatTile title="MCP scope" value="--mcp-config" sub="./.github/mcp-ci.json, this run only" />
          <BigStatTile title="Turn cap" value="--max-turns 150" sub="a session flag, not a settings key" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Every one of these is a command-line argument to <code className="rounded bg-neutral-950 px-1 py-0.5 text-neutral-400">claude</code>, set fresh for
        this one process. None of it lives in a file a future run could drift out of sync with, because none of
        it is allowed to.
      </p>
    </div>
  );
}
