// The real output of piping four sample Bash tool-calls through the
// block-destructive-git.sh hook in this guide's own worked example - actually
// run, not a hypothetical table of what a hook "would" do.

import { TableShell, THead, Th, Tr, Td, CardList, DataCard } from "@/components/ui";

const ROWS = [
  { command: "git push --force origin main", matched: "push --force / -f", exit: 2, result: "Blocked" },
  { command: "git reset --hard HEAD~3", matched: "reset --hard", exit: 2, result: "Blocked" },
  { command: "git status", matched: "-", exit: 0, result: "Allowed" },
  { command: "git push origin feature-branch", matched: "-", exit: 0, result: "Allowed" },
] as const;

export function HookGitTestTable() {
  return (
    <div className="not-prose my-6">
      <CardList>
        {ROWS.map((r) => (
          <DataCard
            key={r.command}
            title={<code className="font-mono text-xs">{r.command}</code>}
            meta={`matched: ${r.matched}`}
            right={
              <span className={r.result === "Blocked" ? "text-red-400" : "text-emerald-400"}>
                {r.result}
              </span>
            }
            stats={[{ label: "exit code", value: r.exit }]}
          />
        ))}
      </CardList>
      <TableShell className="hidden sm:block">
        <THead>
          <Th>Command</Th>
          <Th>Pattern matched</Th>
          <Th className="text-right">Exit code</Th>
          <Th className="text-right">Result</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.command}>
              <Td>
                <code className="font-mono text-xs">{r.command}</code>
              </Td>
              <Td className="text-neutral-400">{r.matched}</Td>
              <Td className="text-right tabular-nums">{r.exit}</Td>
              <Td className={`text-right ${r.result === "Blocked" ? "text-red-400" : "text-emerald-400"}`}>
                {r.result}
              </Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
