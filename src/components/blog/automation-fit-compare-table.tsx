// The axis every other "Claude Code vs Cursor" page skips: not which one
// feels nicer while you're watching, but which one keeps working when a
// cron job invokes it with nobody watching. Flags and behavior checked
// against each product's current CLI docs during the session that wrote
// this guide (code.claude.com/docs/en/cli-reference,
// cursor.com/docs/cli/reference/parameters).

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Non-interactive invocation",
    claude: "claude -p \"prompt\"",
    cursor: "agent -p \"prompt\"",
  },
  {
    axis: "Machine-readable output",
    claude: "--output-format json or stream-json",
    cursor: "--output-format json or stream-json",
  },
  {
    axis: "CI-friendly failure signal",
    claude: "is_error field in the JSON result, mirrored by the process exit code",
    cursor: "Documented output formats exist; a public exit-code table isn't published",
  },
  {
    axis: "MCP servers",
    claude: "--mcp-config loads servers from JSON; --strict-mcp-config locks it to only those",
    cursor: "Built in - mcp login/list/enable/disable subcommands, --approve-mcps to skip prompts",
  },
  {
    axis: "Background/async runs",
    claude: "--background starts a background agent, managed via claude agents",
    cursor: "Cloud Agent handoff delegates a task to run remotely",
  },
] as const;

export function AutomationFitCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Claude Code</Th>
          <Th>Cursor CLI</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.claude}</Td>
              <Td>{r.cursor}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
