// A real dependency check run from the exact GitHub Actions runner that
// builds this site's own guides - not a claim about "CI environments" in the
// abstract. bubblewrap and socat are the two packages Claude Code's sandboxing
// docs list as required for the Bash sandbox on Linux; this runner has
// neither, and carries the Ubuntu 24.04 AppArmor restriction the docs call
// out as blocking bubblewrap's user namespaces outright.

import { StatRow, BigStatTile } from "@/components/ui";

export function SandboxRunnerDependencyFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="bubblewrap installed?"
          value="No"
          sub="which bwrap - command not found, on this repo's own GitHub Actions runner"
        />
        <BigStatTile
          title="socat installed?"
          value="No"
          sub="which socat - also not found; both are required for the Linux Bash sandbox"
        />
        <BigStatTile
          title="AppArmor userns restriction"
          value="1"
          sub="kernel.apparmor_restrict_unprivileged_userns - blocks bubblewrap's sandbox on Ubuntu 24.04+ until a profile is added"
        />
      </StatRow>
    </div>
  );
}
