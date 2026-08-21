// Outrank's own current pricing (outrank.so/pricing, fetched live while
// writing this guide) - the All-in-One plan plus the two article-volume
// add-ons stacked on top of it, since "outrank alternative" searchers are
// usually pricing out the volume tier, not the entry price alone.
// DispatchSEO's row mirrors the framing used elsewhere on this site: no
// seat price, the real cost is hosting plus the DataForSEO account you
// already bring.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tier: "Outrank All-in-One",
    output: "30 articles/mo, auto-published",
    price: "$99/mo",
    note: "Keyword research, AI images, backlink exchange, and every publishing integration included.",
  },
  {
    tier: "Outrank + 90-article add-on",
    output: "90 articles/mo (3/day), auto-published",
    price: "$259/mo",
    note: "$99 base plus the $160/mo add-on. Human-curated editing is a separate $1,399/mo tier on top of that.",
  },
  {
    tier: "DispatchSEO, this project",
    output: "1 guide/day cap, each one a PR",
    price: "$0 software",
    note: "Hosting plus the DataForSEO usage and coding-agent subscription you already pay for - no seat, no article ceiling to buy against.",
  },
] as const;

export function OutrankPricingTiersTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Plan</Th>
          <Th>Output</Th>
          <Th>Price</Th>
          <Th>What's included</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tier}>
              <Td className="font-medium text-neutral-100">{r.tier}</Td>
              <Td>{r.output}</Td>
              <Td className="tabular-nums">{r.price}</Td>
              <Td>{r.note}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Outrank prices by publishing volume - more articles a month means a bigger add-on stack.
        DispatchSEO caps at one guide a day on purpose (see the pacing note further down) and prices
        by usage instead of output.
      </p>
    </div>
  );
}
