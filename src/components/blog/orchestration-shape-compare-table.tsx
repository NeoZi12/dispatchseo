// Three real, differently-named things this keyword can mean, compared on the
// axes that actually decide which one to reach for. Claude Code agent-teams
// rows are sourced from code.claude.com/docs/en/agent-teams (fetched fresh for
// this guide); Managed Agents rows from platform.claude.com/docs/en/managed-agents/multiagent-orchestration;
// the scheduled-fleet column describes this repo's own cron dispatch, not a
// generic third option.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Where it runs",
    teams: "Inside one Claude Code session - the team lead spawns teammates in-process or in tmux/iTerm2 panes",
    managed: "Anthropic's own agent platform - a hosted session your API call creates",
    fleet: "Your own infra: a Vercel cron endpoint, a GitHub Actions schedule: trigger",
  },
  {
    axis: "Needs a human watching",
    teams: "Yes - interactive only. Disabled in non-interactive -p mode and in Agent SDK sessions",
    managed: "No - built for unattended API sessions, but still one continuous session",
    fleet: "No - built to start cold, on a timer, with nothing carried over from last time",
  },
  {
    axis: "How agents coordinate",
    teams: "Direct messages between teammates plus a shared, self-claimable task list",
    managed: "One coordinator delegates to a fixed roster - one level deep, no nested rosters",
    fleet: "They don't coordinate at all - each project's run is independent of every other",
  },
  {
    axis: "Concurrency ceiling",
    teams: "No hard limit documented; Anthropic's own guide suggests starting at 3-5",
    managed: "25 concurrent session threads per session",
    fleet: "As many tenants as listProjects() returns - no platform-side cap either way",
  },
  {
    axis: "A bad instance takes down",
    teams: "Not specified - a failed teammate reports the failure; the lead decides what next",
    managed: "Only itself - a session budget caps spend, one paused thread doesn't stop others",
    fleet: "Only itself - Promise.allSettled means one project's failure resolves alone",
  },
  {
    axis: "To turn it on",
    teams: "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1, then just ask for teammates in plain language",
    managed: "Define a coordinator agent with a multiagent.agents roster over the API",
    fleet: "A cron trigger plus a loop over your own tenant list and your own retry logic",
  },
] as const;

export function OrchestrationShapeCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Claude Code agent teams</Th>
          <Th>Managed Agents orchestration</Th>
          <Th>Scheduled fleet (this site's model)</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.teams}</Td>
              <Td>{r.managed}</Td>
              <Td>{r.fleet}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
