// What actually happens to each kind of context after a Claude Code
// compaction, straight from the "What survives compaction" table at
// code.claude.com/docs/en/context-window (fetched fresh for this guide) -
// condensed to the rows that matter for something running unattended.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    mechanism: "Project-root CLAUDE.md, auto memory, git status, the plan-mode plan",
    outcome: "Re-injected from disk automatically",
  },
  {
    mechanism: "Skill descriptions (the index Claude picks from to decide what to invoke)",
    outcome: "Not reloaded - only skills already invoked in the session survive",
  },
  {
    mechanism: "Rules with paths: frontmatter, nested CLAUDE.md in subdirectories",
    outcome: "Reload only once Claude re-reads a file they match, not automatically",
  },
  {
    mechanism: "Files Claude read or edited",
    outcome: "Up to 5 re-read, most recent first; over 5,000 tokens comes back as a path only",
  },
  {
    mechanism: "Invoked skill bodies",
    outcome: "Re-injected, capped at 5,000 tokens each and 25,000 total - oldest dropped first",
  },
  {
    mechanism: "Full tool output, intermediate reasoning, context a hook added earlier",
    outcome: "Gone - folded into the summary, not kept verbatim",
  },
  {
    mechanism: "Background commands and subagents already running",
    outcome: "Keep running; Claude Code notes which ones so it doesn't duplicate them",
  },
  {
    mechanism: "A SessionStart hook matched to the compact source",
    outcome: "Runs fresh and its output is added to the new context",
  },
] as const;

export function CompactSurvivalTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>What was in context</Th>
          <Th>After compaction</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.mechanism}>
              <Td className="font-medium text-neutral-100">{r.mechanism}</Td>
              <Td className="text-neutral-400">{r.outcome}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
