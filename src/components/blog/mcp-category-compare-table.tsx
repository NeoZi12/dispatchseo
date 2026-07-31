// What actually separates the four categories in the grid above - not
// "what product area," but the three properties that decide whether a
// server can hurt you if it's wrong: does it reach outside your session,
// does it change anything, does it remember. GitHub MCP's own state lives on
// GitHub's side, not the server's, which is why its "remembers" column reads
// no even though GitHub itself obviously does.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    category: "Research & context",
    fetches: "Yes",
    sideEffects: "No",
    remembers: "No",
    example: "Context7",
  },
  {
    category: "Action - browser",
    fetches: "Yes",
    sideEffects: "Yes",
    remembers: "No",
    example: "Playwright MCP",
  },
  {
    category: "Action - your repo",
    fetches: "Yes",
    sideEffects: "Yes",
    remembers: "No - state lives on GitHub's side",
    example: "GitHub MCP",
  },
  {
    category: "State",
    fetches: "No",
    sideEffects: "Yes",
    remembers: "Yes - that's the whole job",
    example: "This site's own server",
  },
] as const;

export function McpCategoryCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Category</Th>
          <Th>Fetches from outside</Th>
          <Th>Side effects</Th>
          <Th>Remembers across calls</Th>
          <Th>Example</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.category}>
              <Td className="font-medium text-neutral-100">{r.category}</Td>
              <Td>{r.fetches}</Td>
              <Td>{r.sideEffects}</Td>
              <Td>{r.remembers}</Td>
              <Td>{r.example}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
