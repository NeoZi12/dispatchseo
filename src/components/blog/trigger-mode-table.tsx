// The comparison this guide turns on: @claude-tag reviews and cron-scheduled
// autonomous runs are both "Claude Code in GitHub Actions," but they need
// different things from the workflow around them. Rows reflect real trigger
// keys (issue_comment/pull_request_review vs schedule/workflow_dispatch) and
// dispatchseo.com's own seo-daily.yml as the scheduled-side example.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Trigger",
    interactive: "issue_comment, pull_request_review - a human types @claude",
    scheduled: "schedule (cron) plus workflow_dispatch - nobody's watching",
  },
  {
    axis: "Memory it needs",
    interactive: "None - the conversation thread is the memory",
    scheduled: "A queue or state store - the run wakes up knowing nothing",
  },
  {
    axis: "Concurrency risk",
    interactive: "Low - bounded by how many people tag it at once",
    scheduled: "Real - an unguarded schedule piles up a PR every run",
  },
  {
    axis: "Output",
    interactive: "A reply, a review comment, or one targeted fix",
    scheduled: "A PR opened from whatever the queue says is next",
  },
  {
    axis: "Best for",
    interactive: "A one-off question, review, or fix on this PR",
    scheduled: "A recurring pipeline that ships on its own clock",
  },
] as const;

export function TriggerModeTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Interactive (@claude tag)</Th>
          <Th>Scheduled / autonomous</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.interactive}</Td>
              <Td>{r.scheduled}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
