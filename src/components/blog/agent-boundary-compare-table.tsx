// Three separate mechanisms people reach for to bound an unattended agent,
// compared on what each actually constrains and what gets past it - not a
// ranking, since the docs' own guidance is to layer them, not pick one.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    boundary: "Bash sandbox (/sandbox)",
    constrains: "Filesystem and network reach of Bash commands only",
    enforcedBy: "OS primitives - Seatbelt on macOS, bubblewrap on Linux/WSL2",
    getsPastIt: "Edit/Write tools, MCP servers, hooks - none of those run inside it",
  },
  {
    boundary: "Permission mode / classifier",
    constrains: "Whether a tool call runs at all, and whether you're asked first",
    enforcedBy: "Claude Code's own permission checks, or the auto-mode classifier",
    getsPastIt: "--dangerously-skip-permissions turns this layer off entirely",
  },
  {
    boundary: "PR + CI merge gate",
    constrains: "Whether a change ever reaches the main branch",
    enforcedBy: "Required checks on the pull request, outside the agent's process",
    getsPastIt: "Nothing the agent does inside its own run - the gate sits after it",
  },
] as const;

export function AgentBoundaryCompareTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.boundary}
            title={r.boundary}
            meta={`enforced by: ${r.enforcedBy}`}
            stats={[
              { label: "constrains", value: r.constrains },
              { label: "gets past it", value: r.getsPastIt },
            ]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Boundary</Th>
          <Th>Constrains</Th>
          <Th>Enforced by</Th>
          <Th>What gets past it</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.boundary}>
              <Td className="font-medium text-neutral-100">{r.boundary}</Td>
              <Td className="text-neutral-300">{r.constrains}</Td>
              <Td className="text-neutral-400">{r.enforcedBy}</Td>
              <Td className="text-neutral-400">{r.getsPastIt}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
