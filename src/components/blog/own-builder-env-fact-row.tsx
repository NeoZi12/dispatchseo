// Real values, not a mockup: `env | grep CLAUDE` run against this exact
// subprocess while this guide was being written, plus the auth fallback and
// the MCP_TIMEOUT this repo adds on top of Claude Code's own defaults, both
// read straight from .github/workflows/seo-daily.yml. Messaging socket/token
// vars from that same env dump are left out on purpose - they're per-run
// secrets, not something a reader needs to reproduce this.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnBuilderEnvFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        env | grep CLAUDE, this exact build, plus seo-daily.yml's own env: block
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile
            title="Auth var used"
            value="OAUTH_TOKEN"
            sub="CLAUDE_CODE_OAUTH_TOKEN first; ANTHROPIC_API_KEY only if that secret is empty"
          />
          <BigStatTile
            title="CLAUDECODE"
            value="1"
            sub="set on this process the moment Claude Code spawned it - confirmed live"
          />
          <BigStatTile
            title="Entrypoint"
            value="github-action"
            sub="CLAUDE_CODE_ENTRYPOINT names the action, not a bare CLI call"
          />
          <BigStatTile
            title="MCP_TIMEOUT"
            value="120000"
            sub="this repo's own ceiling on MCP tool calls - not a Claude Code default"
          />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        None of this is a mockup - it's what a{" "}
        <code className="rounded bg-neutral-950 px-1 py-0.5 text-neutral-400">
          env | grep CLAUDE
        </code>{" "}
        inside this run's own Bash tool actually printed.
      </p>
    </div>
  );
}
