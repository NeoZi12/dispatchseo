// Real values, not placeholders: this repo ships two SKILL.md files of its
// own (SKILL.md and skills/dispatchseo/SKILL.md - packaged with the
// `dispatchseo` npm package for OTHER repos to install, since this repo's own
// Claude Code session uses .claude/commands/ instead, see the agents-vs-skills
// guide). Field docs per code.claude.com/docs/en/skills.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  {
    field: "description",
    matters: "The ONLY field Claude reads to decide whether to auto-load the skill",
    thisRepo: `"Connect a website's repo to a DispatchSEO backend and install its content pipeline. Use when..."`,
  },
  {
    field: "name",
    matters: "Display label only for a personal/project skill - the /command name still comes from the directory",
    thisRepo: `dispatchseo-setup`,
  },
  {
    field: "allowed-tools",
    matters: "Pre-approves specific tools for the turn that invokes the skill, no prompt",
    thisRepo: `Bash(dispatchseo:*)`,
  },
  {
    field: "homepage",
    matters: "Accepted by the Agent Skills spec; Claude Code stores it but takes no action on it",
    thisRepo: `https://dispatchseo.com`,
  },
  {
    field: "metadata",
    matters: "Free-form map for OTHER tooling to read - Claude Code itself ignores its contents entirely",
    thisRepo: `{"openclaw":{"emoji":"🔎","requires":{"bins":["dispatchseo"]}}}`,
  },
] as const;

export function SkillFrontmatterFieldTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.field}
            title={<code className="font-mono text-sm">{r.field}</code>}
            meta={r.matters}
            stats={[{ label: "this repo's real value", value: <span className="font-mono text-[12px]">{r.thisRepo}</span> }]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Field</Th>
          <Th>Why it matters</Th>
          <Th>This repo&apos;s real value</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.field}>
              <Td className="font-mono text-sm text-neutral-100">{r.field}</Td>
              <Td className="text-neutral-400">{r.matters}</Td>
              <Td className="font-mono text-[12px] text-neutral-300">{r.thisRepo}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
