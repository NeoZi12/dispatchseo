// Every row is a documented fact, not a guess: routine limits from
// code.claude.com/docs/en/routines (research preview, fetched fresh for this
// guide), cron-side behavior from this project's own vercel.json + GitHub
// Actions workflows, which actually run the retries and alerting described
// here.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Runs on",
    routine: "Anthropic's cloud (or a routed self-hosted environment) - nothing of yours to host",
    cron: "Infrastructure you own: a Vercel cron endpoint, a GitHub Actions runner",
  },
  {
    axis: "Minimum interval",
    routine: "1 hour - a tighter custom cron expression is rejected",
    cron: "Whatever crontab allows - this project runs one workflow every 10 minutes",
  },
  {
    axis: "Runs per day",
    routine: "Capped by plan: 5 (Pro), 15 (Max), 25 (Team/Enterprise)",
    cron: "No platform-side cap - bounded only by your own Action minutes",
  },
  {
    axis: "Retries a failed run",
    routine: "Not documented - a run either finishes or it doesn't",
    cron: "Whatever your workflow codes: a backoff, a dead-man's-switch retrigger",
  },
  {
    axis: "Memory between runs",
    routine: "None built in beyond what connectors read live each time",
    cron: "Any store you wire up - a database, a JSON file, an MCP server",
  },
  {
    axis: "Needs a claude.ai subscription",
    routine: "Yes - Pro, Max, Team, or Enterprise with Claude Code on the web on",
    cron: "No - runs on pure metered ANTHROPIC_API_KEY billing just as well",
  },
] as const;

export function RoutineVsCronTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Claude Code routine</Th>
          <Th>Real cron (Vercel / GitHub Actions)</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.routine}</Td>
              <Td>{r.cron}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
