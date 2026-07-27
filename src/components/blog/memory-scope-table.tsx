// The four places a CLAUDE.md file can live and what actually differs between
// them - load order, not just location, from Claude Code's own memory docs
// (code.claude.com/docs/en/memory), fetched fresh for this guide rather than
// pulled from a cached mental model.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    scope: "Managed policy",
    location: "/etc/claude-code/CLAUDE.md (Linux/WSL)",
    purpose: "Org-wide rules pushed by IT/DevOps",
    sharedWith: "Every user on the machine - can't be excluded",
  },
  {
    scope: "User",
    location: "~/.claude/CLAUDE.md",
    purpose: "Your personal preferences, every project",
    sharedWith: "Just you, all projects",
  },
  {
    scope: "Project",
    location: "./CLAUDE.md or ./.claude/CLAUDE.md",
    purpose: "Team-shared architecture and conventions",
    sharedWith: "The team, via version control",
  },
  {
    scope: "Local",
    location: "./CLAUDE.local.md",
    purpose: "Your own sandbox URLs, personal test data",
    sharedWith: "Just you, this project - gitignored",
  },
] as const;

export function MemoryScopeTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Scope</Th>
          <Th>Location</Th>
          <Th>Purpose</Th>
          <Th>Shared with</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.scope}>
              <Td className="font-medium text-neutral-100">{r.scope}</Td>
              <Td className="font-mono text-xs">{r.location}</Td>
              <Td>{r.purpose}</Td>
              <Td>{r.sharedWith}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
