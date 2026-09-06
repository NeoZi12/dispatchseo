// Skill vs. subagent, on the one axis that actually decides which to reach
// for: what it costs to have installed and where its output lands. Numbers
// are platform.claude.com's own agent-skills docs (Level 1/2/3 token costs)
// and code.claude.com's sub-agents docs (built-in agents need no file) -
// fetched fresh for this guide, not carried over from memory.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    mechanism: "Skill (SKILL.md)",
    runsIn: "Your main context window",
    restingCost: "~100 tokens (name + description), always resident",
    triggeredCost: "Under 5k tokens - only when a request matches its description",
    needsFile: "Yes - .claude/skills/<name>/ or .claude/commands/<name>.md",
  },
  {
    mechanism: "Custom subagent",
    runsIn: "Its own isolated context window",
    restingCost: "0 - nothing resident until Claude delegates to it",
    triggeredCost: "A fresh window; only its final summary returns to the caller",
    needsFile: "Yes - .claude/agents/<name>.md",
  },
  {
    mechanism: "Built-in subagent (Explore, Plan, general-purpose)",
    runsIn: "Its own isolated context window",
    restingCost: "0 - no file, no metadata, nothing to load at startup",
    triggeredCost: "Same isolated-window, summary-only return as a custom one",
    needsFile: "No - Claude spawns it on request with zero configuration",
  },
] as const;

export function SkillAgentTokenCostTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.mechanism}
            title={r.mechanism}
            meta={`runs in: ${r.runsIn}`}
            stats={[
              { label: "resting cost", value: r.restingCost },
              { label: "when triggered", value: r.triggeredCost },
              { label: "needs a file?", value: r.needsFile },
            ]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Mechanism</Th>
          <Th>Runs in</Th>
          <Th>Resting cost</Th>
          <Th>When triggered</Th>
          <Th>Needs a file?</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.mechanism}>
              <Td className="font-medium text-neutral-100">{r.mechanism}</Td>
              <Td className="text-neutral-400">{r.runsIn}</Td>
              <Td className="text-neutral-300">{r.restingCost}</Td>
              <Td className="text-neutral-400">{r.triggeredCost}</Td>
              <Td className="text-neutral-400">{r.needsFile}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
