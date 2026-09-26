// The four independent timeout layers Claude Code actually has, each with its
// own default and override - from code.claude.com/docs/en/env-vars and
// code.claude.com/docs/en/mcp (both fetched fresh for this guide). None of
// these layers knows about the others, which is why "it's stuck" usually
// means one specific layer never fired, not that timeouts don't exist.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    layer: "Bash tool",
    guards: "one shell command Claude runs",
    default: "2 min default, 10 min ceiling the model can request",
    change: "BASH_DEFAULT_TIMEOUT_MS / BASH_MAX_TIMEOUT_MS in settings.json's env block",
  },
  {
    layer: "MCP tool call",
    guards: "one call to an MCP server",
    default: "no wall-clock cap unless set - idle abort after 5 min (HTTP/SSE/WS) or 30 min (stdio) with no response or progress",
    change: "MCP_TOOL_TIMEOUT env var, or a per-server timeout in .mcp.json",
  },
  {
    layer: "Automatic MCP backgrounding",
    guards: "a single tool call inside one turn",
    default: "2 minutes",
    change: "CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS - past this, a slow-but-alive call moves to background instead of blocking the turn",
  },
  {
    layer: "Process wall clock",
    guards: "the entire run, however it got stuck",
    default: "none built in",
    change: "timeout-minutes: N on a GitHub Actions job, or wrap claude -p in the timeout(1) command",
  },
] as const;

export function TimeoutLayerCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Layer</Th>
          <Th>Guards</Th>
          <Th>Default</Th>
          <Th>How to change it</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.layer}>
              <Td className="font-medium text-neutral-100">{r.layer}</Td>
              <Td className="text-neutral-300">{r.guards}</Td>
              <Td className="text-neutral-400">{r.default}</Td>
              <Td className="font-mono text-xs text-neutral-400">{r.change}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
