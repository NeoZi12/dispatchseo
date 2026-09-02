// Four mechanisms Claude Code guides conflate because they all start with a
// markdown file and end up doing something automatic - per code.claude.com's
// current skills and hooks references, not the pre-merge "commands are their
// own separate thing" model most existing posts on this keyword still teach.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    mechanism: "Slash command",
    invokedBy: "You, typing /name",
    runsIn: "Your current session",
    bestFor: "An explicit action only you should trigger, never Claude",
  },
  {
    mechanism: "Skill (default)",
    invokedBy: "You, or Claude automatically",
    runsIn: "Your current session",
    bestFor: "Knowledge or a procedure Claude should reach for on its own",
  },
  {
    mechanism: "Hook",
    invokedBy: "Nobody - fires on a lifecycle event",
    runsIn: "Outside the model entirely",
    bestFor: "A rule that can never depend on the model choosing to follow it",
  },
  {
    mechanism: "Forked skill / subagent",
    invokedBy: "You, Claude, or a scheduled trigger",
    runsIn: "An isolated background context",
    bestFor: "Multi-step work that shouldn't crowd the main conversation",
  },
] as const;

export function CommandVsSkillHookTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.mechanism}
            title={r.mechanism}
            meta={`invoked by: ${r.invokedBy}`}
            stats={[
              { label: "runs in", value: r.runsIn },
              { label: "best for", value: r.bestFor },
            ]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Mechanism</Th>
          <Th>Invoked by</Th>
          <Th>Runs in</Th>
          <Th>Best for</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.mechanism}>
              <Td className="font-medium text-neutral-100">{r.mechanism}</Td>
              <Td className="text-neutral-400">{r.invokedBy}</Td>
              <Td className="text-neutral-400">{r.runsIn}</Td>
              <Td className="text-neutral-400">{r.bestFor}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
