// The "Compare scheduling options" table at
// code.claude.com/docs/en/scheduled-tasks, transcribed - three ways Claude
// Code schedules recurring work, and /loop is the one bounded to a session
// nobody's really watching.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  { axis: "Runs on", cloud: "Anthropic's cloud by default", desktop: "your machine", loop: "your machine" },
  { axis: "Requires the machine on", cloud: "No", desktop: "Yes", loop: "Yes" },
  { axis: "Requires an open session", cloud: "No", desktop: "No", loop: "Yes" },
  { axis: "Persistent across restarts", cloud: "Yes", desktop: "Yes", loop: "Restored on --resume if unexpired" },
  { axis: "Access to local files", cloud: "No - fresh clone", desktop: "Yes", loop: "Yes" },
  { axis: "Minimum interval", cloud: "1 hour", desktop: "1 minute", loop: "1 minute" },
] as const;

export function SchedulingSurfaceTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Cloud (routines)</Th>
          <Th>Desktop task</Th>
          <Th>/loop</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.cloud}</Td>
              <Td>{r.desktop}</Td>
              <Td>{r.loop}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
