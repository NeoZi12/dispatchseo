// Wincher's own current pricing page (wincher.com/pricing, fetched live while
// writing this guide) publishes the keyword floor and feature gate for each
// tier, but not a static dollar figure - the price only renders after picking
// a currency and a monthly/yearly toggle client-side. That gap is reported
// here as a fact, not filled in with a guessed number.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tier: "Wincher Starter",
    keywords: "500+",
    gate: "10 sites, 1 user, daily updates, 5 competitor tracks/site",
  },
  {
    tier: "Wincher Professional",
    keywords: "1,000+",
    gate: "Unlimited sites, multiple users, on-demand updates, unlimited keyword lookups",
  },
  {
    tier: "Wincher Agency",
    keywords: "5,000+",
    gate: "20 competitor tracks/site, all research and optimization tools, white-label reports",
  },
  {
    tier: "DispatchSEO, this project",
    keywords: "50",
    gate: "DataForSEO usage plus hosting - no seat, no keyword floor to clear",
  },
] as const;

export function WincherTierKeywordTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Tier</Th>
          <Th>Keyword floor</Th>
          <Th>What else the tier gates</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tier}>
              <Td className="font-medium text-neutral-100">{r.tier}</Td>
              <Td className="tabular-nums">{r.keywords}</Td>
              <Td>{r.gate}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Wincher&apos;s pricing page doesn&apos;t print a monthly number for any tier - it renders
        one only after a visitor picks a currency and a monthly/yearly toggle client-side. The one
        static price on the page is overage: extra credits cost &euro;10 per 500, on top of the 25
        included with every plan. DispatchSEO&apos;s cost tracks the DataForSEO account behind it
        instead of a keyword floor.
      </p>
    </div>
  );
}
