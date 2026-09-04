// This repo's own daily guide-builder workflow - the one that wrote this
// exact article - read straight from .github/workflows/seo-daily.yml rather
// than described from memory: its permission posture is a single CLI flag,
// no settings.json rules file at all, and the thing that actually stops a
// bad run is the PR gate downstream, not the permission system.

import { StatRow, BigStatTile } from "@/components/ui";

export function CiPermissionFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        .github/workflows/seo-daily.yml, this repo, read while writing this guide
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile
            title="Permission mode"
            value="bypassPermissions"
            sub="a --permission-mode CLI flag, not a settings.json defaultMode"
          />
          <BigStatTile
            title="Rules file"
            value="none"
            sub="no .claude/settings.json checked into this repo at all"
          />
          <BigStatTile title="MCP scope" value="--mcp-config" sub="./.github/mcp-ci.json, one file, this run only" />
          <BigStatTile
            title="What actually gates it"
            value="PR + green build"
            sub="seo-auto-merge.yml, outside the agent's own process"
          />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        No allow list, no deny list - the isolation of a disposable runner plus a required check downstream
        does the job that rules would otherwise have to do.
      </p>
    </div>
  );
}
