// The comparison this guide turns on: an interactive, human-watched Claude
// Code session and a scheduled, unattended one (dispatchseo.com's own
// guide-builder run) use the exact same product, but only one has to survive
// a cold start every morning with no human watching. Rows reflect real
// mechanics from dispatchseo.com's own build-guide pipeline, not a generic
// checklist.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "State between runs",
    demo: "None - the chat thread is the memory, gone when it closes",
    production: "A queue row in Supabase, read fresh over MCP on every cold start",
  },
  {
    axis: "Idempotency",
    demo: "Not a concern - a human re-asks if something looks wrong",
    production: "Claimed explicitly (status -> in_progress) before a word is drafted, so a second run can't pick up the same item",
  },
  {
    axis: "Auth model",
    demo: "Whatever the local session already has",
    production: "One bearer token per tenant - the token IS which project's queue gets touched",
  },
  {
    axis: "Failure visibility",
    demo: "Visible immediately - you're watching the conversation",
    production: "Has to fail loud on purpose (a red CI run, a reverted claim) or it fails silent",
  },
  {
    axis: "Verification",
    demo: "You read the output before trusting it",
    production: "A merge gate reads it instead - green checks or it doesn't ship",
  },
] as const;

export function SubagentShapeCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Interactive, human-watched</Th>
          <Th>Scheduled, unattended</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.demo}</Td>
              <Td>{r.production}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
