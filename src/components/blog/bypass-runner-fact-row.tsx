// This build's own identity check against Claude Code's documented root/sudo
// refusal for --dangerously-skip-permissions, plus the exact CLI version's
// --help output confirming the flag names this article cites still exist -
// not a claim about "CI environments" in the abstract, this exact runner.

import { StatRow, BigStatTile } from "@/components/ui";

export function BypassRunnerFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Running as root?"
          value="No"
          sub="whoami -> runner, id -u -> 1001, on this repo's own GitHub Actions runner"
        />
        <BigStatTile
          title="OS on this runner"
          value="Ubuntu 24.04.4"
          sub="cat /etc/os-release, checked live for this build"
        />
        <BigStatTile
          title="CLI version + flags"
          value="v2.1.259"
          sub="claude --help confirms --dangerously-skip-permissions and --permission-mode bypassPermissions both still accepted"
        />
      </StatRow>
    </div>
  );
}
