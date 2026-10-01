// Four ways a credential can reach a containerized Claude Code run, and what
// each leaves behind. Sourced from the dev container docs and from the
// docker history check run for this guide (no token string in any layer when
// it is passed with -e at run time).

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  { way: "ENV or ARG in the Dockerfile", leaves: "The token sits in an image layer and in docker history", verdict: "Never" },
  { way: "-e CLAUDE_CODE_OAUTH_TOKEN at docker run", leaves: "Only in that container's environment; docker history shows nothing", verdict: "Default for unattended runs" },
  { way: "Named volume at ~/.claude plus CLAUDE_CONFIG_DIR", leaves: "Login survives rebuilds; anything in the container can read it", verdict: "Interactive use" },
  { way: "Bind-mounting the host's ~/.ssh or cloud credential files", leaves: "The whole host key is reachable from the container", verdict: "Avoid - use a scoped token" },
] as const;

export function ContainerCredentialPathTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>How it gets in</Th>
          <Th>What it leaves behind</Th>
          <Th>Verdict</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.way}>
              <Td className="font-mono text-xs text-neutral-100">{r.way}</Td>
              <Td className="text-neutral-400">{r.leaves}</Td>
              <Td className="text-neutral-300">{r.verdict}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
