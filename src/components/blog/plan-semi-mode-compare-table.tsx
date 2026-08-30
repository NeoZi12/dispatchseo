// Plan mode's human-review-before-action mechanic, mapped onto DispatchSEO's
// own Semi-automatic project mode - same shape (propose, then a human decides
// before anything ships), one layer up from a single session to a whole queue.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    mechanism: "Claude Code plan mode",
    blocked: "Edits to any file, most shell commands",
    whoApproves: "You, in the session, per plan",
    unlocks: "The plan's edits start running in that same session",
  },
  {
    mechanism: "DispatchSEO Semi-automatic mode",
    blocked: "The agent's own suggestion-queue approval",
    whoApproves: "The site owner, on the dashboard queue",
    unlocks: "The build runs and opens a pull request",
  },
] as const;

export function PlanSemiModeCompareTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.mechanism}
            title={r.mechanism}
            meta={`who approves: ${r.whoApproves}`}
            stats={[
              { label: "blocked until yes", value: r.blocked },
              { label: "what yes unlocks", value: r.unlocks },
            ]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Mechanism</Th>
          <Th>Blocked until approval</Th>
          <Th>Who approves</Th>
          <Th>What approval unlocks</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.mechanism}>
              <Td className="font-medium text-neutral-100">{r.mechanism}</Td>
              <Td className="text-neutral-300">{r.blocked}</Td>
              <Td className="text-neutral-400">{r.whoApproves}</Td>
              <Td className="text-neutral-400">{r.unlocks}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
