// The three places Claude Code will store a server you add, and the rule
// that actually matters when a name collides across them: highest precedence
// wins outright, fields are never merged - real facts from the MCP docs'
// scope table, not a generic "there are scopes" summary.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    scope: "Local (default)",
    storedIn: "~/.claude.json",
    shared: "No - private to you",
    loadsIn: "This project only",
  },
  {
    scope: "Project",
    storedIn: ".mcp.json in the repo root",
    shared: "Yes, via version control",
    loadsIn: "This project only",
  },
  {
    scope: "User",
    storedIn: "~/.claude.json",
    shared: "No - private to you",
    loadsIn: "Every project on your machine",
  },
] as const;

export function ScopeCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Scope</Th>
          <Th>Stored in</Th>
          <Th>Shared with team</Th>
          <Th>Loads in</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.scope}>
              <Td className="font-medium text-neutral-100">{r.scope}</Td>
              <Td className="font-mono text-xs">{r.storedIn}</Td>
              <Td>{r.shared}</Td>
              <Td>{r.loadsIn}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
