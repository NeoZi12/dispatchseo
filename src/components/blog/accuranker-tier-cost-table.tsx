// AccuRanker's own current pricing page (accuranker.com/pricing, fetched live
// while writing this guide) - three tiers, priced by keyword count, not by
// feature. DispatchSEO's row is this project's own real scale: no seat, cost
// tracks the DataForSEO account behind it instead of a keyword ceiling.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tier: "AccuRanker Professional",
    keywords: "2,000 - 5,000",
    price: "$224/mo",
    note: "Freelancers, consultants, small agencies",
  },
  {
    tier: "AccuRanker Expert",
    keywords: "10,000 - 25,000",
    price: "$764/mo",
    note: "Most popular tier - growing agencies, mid-size in-house teams",
  },
  {
    tier: "AccuRanker Enterprise",
    keywords: "25,000+",
    price: "Custom",
    note: "Sales contact required - BigQuery access, unlimited write API",
  },
  {
    tier: "DispatchSEO, this project",
    keywords: "45",
    price: "$0 software",
    note: "DataForSEO usage plus hosting - no seat, no keyword ceiling to price against",
  },
] as const;

export function AccurankerTierCostTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Tier</Th>
          <Th>Keyword range</Th>
          <Th>Price</Th>
          <Th>Who it's priced for</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tier}>
              <Td className="font-medium text-neutral-100">{r.tier}</Td>
              <Td className="tabular-nums">{r.keywords}</Td>
              <Td className="tabular-nums">{r.price}</Td>
              <Td>{r.note}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        AccuRanker prices by keyword count, not by job - tracking 45 keywords still means picking a
        seat sized for thousands. DispatchSEO&apos;s cost tracks the DataForSEO account behind it
        instead of a keyword ceiling: roughly $1.62/month at nightly live-mode checks for a
        few dozen tracked terms.
      </p>
    </div>
  );
}
