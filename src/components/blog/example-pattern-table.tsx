// The comparison this guide is actually about: three shapes of "MCP server
// example" and what each one really has under the hood - tool count, auth
// model, and whether anything persists between calls. Reference-server count
// (7) is from modelcontextprotocol/servers' current README; the wrapper row
// is deliberately qualitative (no invented tool count for servers we didn't
// read the source of); the backend row is dispatchseo.com's own, counted
// straight from its route file.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    pattern: "Reference implementation",
    tools: "7, across the official repo",
    auth: "None - local subprocess over stdio",
    state: "None, dies with the process",
    builtFor: "Learning the SDK",
  },
  {
    pattern: "Single-service wrapper",
    tools: "A handful, scoped to one API",
    auth: "One shared API key",
    state: "None - proxies the API's own state",
    builtFor: "Giving an agent one product's actions",
  },
  {
    pattern: "Stateful, multi-tenant backend",
    tools: "44, across six areas of state",
    auth: "One bearer token, resolved per request",
    state: "A database row scoped to the caller",
    builtFor: "Running as a real, shared backend",
  },
] as const;

export function ExamplePatternTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Pattern</Th>
          <Th>Tools</Th>
          <Th>Auth</Th>
          <Th>State</Th>
          <Th>Built for</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.pattern}>
              <Td className="font-medium text-neutral-100">{r.pattern}</Td>
              <Td>{r.tools}</Td>
              <Td>{r.auth}</Td>
              <Td>{r.state}</Td>
              <Td>{r.builtFor}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
