// Not "what each free tool covers" (the grid above already answers that) -
// what happens to what it found the moment you close the tab. That's the
// actual gap this guide argues, made concrete per tool.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tool: "Google Keyword Planner",
    covers: "Keyword ideas and volume ranges",
    after: "Nothing - re-run the same search next time you need an idea",
  },
  {
    tool: "Screaming Frog, free version",
    covers: "One technical crawl, up to 500 URLs",
    after: "Nothing - the free version can't even save the crawl you just ran",
  },
  {
    tool: "A SERP API's free tier",
    covers: "Today's ranking position for one keyword",
    after: "Nothing automatic - no scheduled recheck ships on the free plan",
  },
  {
    tool: "A vendor's free tools page",
    covers: "One audit, checker, or calculator",
    after: "Nothing - it's a lead form with a report attached",
  },
] as const;

export function FreeToolMemoryCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Tool</Th>
          <Th>What it covers</Th>
          <Th>What it remembers after you close the tab</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tool}>
              <Td className="font-medium text-neutral-100">{r.tool}</Td>
              <Td>{r.covers}</Td>
              <Td className="text-neutral-400">{r.after}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
