// Flag-by-flag, sourced from Claude Code's own --help output plus
// code.claude.com/docs/en/{headless,sandboxing,cli-reference} on one side,
// and developers.openai.com/codex's cli/reference, agent-approvals-security
// and concepts/sandboxing pages on the other - fetched during the session
// that wrote this guide, not recalled from training.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Non-interactive entrypoint",
    claude: "claude -p \"prompt\"",
    codex: "codex exec \"prompt\" (alias codex e)",
  },
  {
    axis: "Reproducible CI startup",
    claude: "--bare skips hooks, skills, MCP, CLAUDE.md and auto memory - documented as the future default for -p",
    codex: "No single equivalent flag documented; scope is narrowed per-run via --sandbox instead",
  },
  {
    axis: "Sandbox modes",
    claude: "Built-in Bash sandbox, configured via /sandbox or settings.json",
    codex: "--sandbox / -s: read-only, workspace-write, danger-full-access",
  },
  {
    axis: "Skip approval for a run nobody can answer",
    claude: "--permission-prompts none, paired with --permission-mode auto or dontAsk",
    codex: "--ask-for-approval / -a never (on-request just waits for a person)",
  },
  {
    axis: "Fully unsandboxed override",
    claude: "--dangerously-skip-permissions",
    codex: "--dangerously-bypass-approvals-and-sandbox (--yolo)",
  },
  {
    axis: "Structured output",
    claude: "--output-format json, plus --json-schema for a validated structured_output field",
    codex: "--json / --experimental-json (line-delimited events), plus --output-schema",
  },
  {
    axis: "Resume a cut-off session",
    claude: "--resume <session-id> or --continue",
    codex: "codex exec resume [SESSION_ID] [PROMPT]",
  },
  {
    axis: "MCP servers",
    claude: "--mcp-config, --strict-mcp-config; load failures surface in system/init's mcp_server_errors",
    codex: "codex mcp add / list / remove / login / logout / get",
  },
  {
    axis: "Official CI action",
    claude: "anthropics/claude-code-action",
    codex: "openai/codex-action",
  },
] as const;

export function UnattendedFlagCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Claude Code</Th>
          <Th>Codex CLI</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.claude}</Td>
              <Td>{r.codex}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
