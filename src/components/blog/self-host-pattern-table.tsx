// Two things people call "self-hosted AI" that behave nothing alike once you
// look at what decides what happens next - a person typing, or a schedule.
// Not illustrative labels: this is the actual fork this guide argues for.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    pattern: "Chat runtime",
    hosts: "Model weights + a chat interface",
    decides: "You, one prompt at a time",
    stack: "Ollama (or similar) + Open WebUI / LM Studio",
    fit: "Private, ad hoc conversations - coding help, drafting, research chat",
  },
  {
    pattern: "Task-built agent",
    hosts: "State for one recurring job - a queue, history, credentials",
    decides: "A schedule or an event, not a person typing",
    stack: "Your own backend (DB + cron) + an agent CLI already running your model",
    fit: "A job that recurs - tracking, publishing, monitoring - not one conversation",
  },
] as const;

export function SelfHostPatternTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Pattern</Th>
          <Th>What it hosts</Th>
          <Th>What decides what happens next</Th>
          <Th>Typical stack</Th>
          <Th>When it's the right call</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.pattern}>
              <Td className="font-medium text-neutral-100">{r.pattern}</Td>
              <Td>{r.hosts}</Td>
              <Td>{r.decides}</Td>
              <Td className="font-mono text-xs">{r.stack}</Td>
              <Td>{r.fit}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
