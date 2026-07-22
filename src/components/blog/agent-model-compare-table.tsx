// The fork this guide argues for: two things page 1 calls "AI SEO agent"
// that put the reasoning in a different place - a vendor's model behind a
// UI, or the agent CLI you already run everything else through.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    model: "AI-writing bolted on",
    reasoning: "A model the vendor hosts, wired into their own SEO dashboard",
    state: "Locked in the vendor's database - exportable only as far as they let you",
    ships: "A draft you paste into your CMS yourself",
    stack: "One more per-seat SaaS subscription",
  },
  {
    model: "Agent-as-driver",
    reasoning: "The agent CLI you already run for everything else (Claude Code)",
    state: "Your own database - a queue, keyword history, rank checks you can query directly",
    ships: "A pull request against your actual content repo",
    stack: "The agent subscription you already pay for, plus infra you own",
  },
] as const;

export function AgentModelCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Model</Th>
          <Th>Where the reasoning runs</Th>
          <Th>Where the state lives</Th>
          <Th>What a run ships</Th>
          <Th>What you pay for</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.model}>
              <Td className="font-medium text-neutral-100">{r.model}</Td>
              <Td>{r.reasoning}</Td>
              <Td>{r.state}</Td>
              <Td>{r.ships}</Td>
              <Td>{r.stack}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
