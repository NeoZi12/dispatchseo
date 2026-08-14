// The two automation shapes this guide argues are different jobs, not
// competing products - axes chosen from how each one actually produces a
// page, not from marketing copy on either side.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    axis: "Unit of production",
    scale: "One template, cloned per dataset row",
    judgment: "One keyword, decided on its own",
  },
  {
    axis: "What has to exist first",
    scale: "A structured dataset - locations, SKUs, integrations, comparisons",
    judgment: "A keyword and a live page-1 read",
  },
  {
    axis: "Typical run size",
    scale: "Hundreds to thousands of pages in one pass",
    judgment: "One page, once a day",
  },
  {
    axis: "What stops a bad page",
    scale: "Nothing built into the merge step - QA is a separate pass, if it runs at all",
    judgment: "A gate that refuses to build anything that can't beat page 1",
  },
  {
    axis: "Where it earns its keep",
    scale: "Real per-row variance - a city, a SKU, a listing actually differs",
    judgment: "Competitive or judgment-heavy queries, where sameness gets discounted",
  },
] as const;

export function ScaleVsJudgmentCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Axis</Th>
          <Th>Template + dataset</Th>
          <Th>One page, decided daily</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.axis}>
              <Td className="font-medium text-neutral-100">{r.axis}</Td>
              <Td>{r.scale}</Td>
              <Td>{r.judgment}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
