// Claude Code's CLI against Devin's terminal CLI (the agent that replaced
// "Windsurf, the editor" for scripted use), on the axes a cron job touches.
// Devin cells come from docs.devin.ai/cli/reference/commands and
// /cli/extensibility/configuration; Claude cells from `claude --help` run in
// the sandbox that built this guide. "Not documented" is a real finding, not
// a blank - a CI step can only gate on what is written down.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Non-interactive invocation",
    claude: "claude -p \"prompt\"",
    devin: "devin -p \"prompt\" (single turn, prints and exits)",
  },
  {
    axis: "Machine-readable result",
    claude: "--output-format json or stream-json",
    devin: "Not documented for a prompt's response - JSON is documented for devin models list and devin list only",
  },
  {
    axis: "Failure signal for CI",
    claude: "is_error in the JSON, matching the process exit code",
    devin: "No exit-code table published",
  },
  {
    axis: "Trust prompt in a fresh checkout",
    claude: "Not exercised in this guide's run - test it in your own checkout",
    devin: "-p fails in an untrusted directory unless --respect-workspace-trust false",
  },
  {
    axis: "Project MCP config",
    claude: "--mcp-config <file or JSON>, --strict-mcp-config to use only that",
    devin: ".devin/mcp_config.json, secrets in .devin/mcp_config.local.json",
  },
  {
    axis: "CI authentication",
    claude: "Stored login or token, checked by the run itself",
    devin: "devin auth login; no env-var or token flow documented",
  },
] as const;

export function HeadlessSurfaceCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Claude Code</Th>
          <Th>Devin CLI (ex-Windsurf)</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.claude}</Td>
              <Td>{r.devin}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
