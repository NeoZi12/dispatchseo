// The six separate clocks a Claude Code run can die on, with the default each
// one ships with and the one setting that moves it - all from
// code.claude.com/docs/en/env-vars and /errors (fetched fresh for this guide).
// Shows the structure behind "which timeout is this?" instead of one number.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    clock: "Foreground Bash command",
    fires: "2 min (model may ask for up to 10 min)",
    knob: "BASH_DEFAULT_TIMEOUT_MS, BASH_MAX_TIMEOUT_MS",
  },
  {
    clock: "One API request",
    fires: "10 min, retried up to 10 times first",
    knob: "API_TIMEOUT_MS, CLAUDE_CODE_MAX_RETRIES",
  },
  {
    clock: "Streaming body goes quiet",
    fires: "5 min with no bytes",
    knob: "API_FORCE_IDLE_TIMEOUT",
  },
  {
    clock: "MCP tool call, network server",
    fires: "5 min with no response or progress",
    knob: "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT, MCP_TOOL_TIMEOUT",
  },
  {
    clock: "MCP tool call, stdio server",
    fires: "30 min with no response or progress",
    knob: "CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT",
  },
  {
    clock: "Background subagent",
    fires: "10 min without progress",
    knob: "CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS",
  },
] as const;

export function ClaudeTimeoutClockTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Clock</Th>
          <Th>Default</Th>
          <Th>What moves it</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.clock}>
              <Td className="font-medium text-neutral-100">{r.clock}</Td>
              <Td className="text-neutral-300">{r.fires}</Td>
              <Td className="font-mono text-xs text-neutral-400">{r.knob}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
