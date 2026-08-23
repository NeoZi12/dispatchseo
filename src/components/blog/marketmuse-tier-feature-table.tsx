// MarketMuse's own pricing page (marketmuse.com/pricing), fetched live while
// writing this guide. No tier past Free carries a listed price - every number
// below is a feature cap, not a dollar figure, because MarketMuse doesn't
// publish one.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  { feature: "Price", free: "$0", optimize: "Quote-based", research: "Quote-based", strategy: "Quote-based" },
  { feature: "Site inventories", free: "0", optimize: "1", research: "1", strategy: "1" },
  { feature: "Users", free: "1", optimize: "1", research: "3", strategy: "5" },
  { feature: "Tracked topics", free: "0", optimize: "100", research: "1,000", strategy: "10,000" },
  { feature: "Content briefs / mo", free: "0", optimize: "5", research: "10", strategy: "20" },
  { feature: "Brief types", free: "None", optimize: "Article only", research: "Article only", strategy: "All 9 types" },
  { feature: "Strategy docs / mo", free: "0", optimize: "1", research: "3", strategy: "5" },
  { feature: "Queries / mo", free: "10", optimize: "100", research: "Unlimited", strategy: "Unlimited" },
] as const;

export function MarketmuseTierFeatureTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Feature</Th>
          <Th>Free</Th>
          <Th>Optimize</Th>
          <Th>Research</Th>
          <Th>Strategy</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.feature}>
              <Td className="font-medium text-neutral-100">{r.feature}</Td>
              <Td className="tabular-nums">{r.free}</Td>
              <Td className="tabular-nums">{r.optimize}</Td>
              <Td className="tabular-nums">{r.research}</Td>
              <Td className="tabular-nums">{r.strategy}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Every number above is a cap MarketMuse&apos;s own pricing page states outright; none of the
        three paid tiers list a dollar figure next to it - that&apos;s a sales conversation, not a
        checkout page.
      </p>
    </div>
  );
}
