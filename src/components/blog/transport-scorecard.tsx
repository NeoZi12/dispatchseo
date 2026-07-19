// The comparison table that actually matters when picking a transport - what
// the MCP spec currently says about each, not vibes. Streamable HTTP replaced
// HTTP+SSE in the 2025-06-18 spec revision (spec version 2024-11-05 is the
// deprecated one); stdio was never in competition, it just solves a different
// problem (one local subprocess vs. a remote server serving many clients).

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    transport: "stdio",
    runsAs: "Subprocess the client launches",
    clients: "One, local",
    status: "Current - local servers only",
  },
  {
    transport: "HTTP+SSE",
    runsAs: "Long-lived server process",
    clients: "Many, remote",
    status: "Deprecated (spec 2024-11-05)",
  },
  {
    transport: "Streamable HTTP",
    runsAs: "Long-lived server process",
    clients: "Many, remote",
    status: "Current (spec 2025-06-18)",
  },
] as const;

export function TransportScorecard() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Transport</Th>
          <Th>Runs as</Th>
          <Th>Clients</Th>
          <Th>Spec status</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.transport}>
              <Td className="font-medium text-neutral-100">{r.transport}</Td>
              <Td>{r.runsAs}</Td>
              <Td>{r.clients}</Td>
              <Td className={r.status.startsWith("Deprecated") ? "text-amber-300" : "text-emerald-400"}>
                {r.status}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
