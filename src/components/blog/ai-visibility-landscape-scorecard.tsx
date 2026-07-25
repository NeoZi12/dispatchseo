// The named vendors page 1 actually recommends for AI-visibility tracking,
// checked live against each one's own pricing/product page during the
// session that wrote this guide (Peec AI and SE Ranking don't publish a
// dollar figure at all - that opacity is reported as-is, not filled in).

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    vendor: "Profound",
    model: "Standalone SaaS",
    price: "$99/mo",
    note: "Starter tier, billed yearly (tryprofound.com/pricing). Growth runs $399/mo; Enterprise is custom.",
  },
  {
    vendor: "Peec AI",
    model: "Standalone SaaS",
    price: "Not published",
    note: "Four tiers, all billed annually (peec.ai/pricing) - no vendor discloses a number without a signup.",
  },
  {
    vendor: "SE Ranking AI Visibility Tracker",
    model: "Bolt-on to an existing suite",
    price: "5 free checks/day",
    note: "Not sold on its own - rides an SE Ranking subscription, capped daily teaser for non-customers.",
  },
  {
    vendor: "DispatchSEO",
    model: "Folded into the SEO backend",
    price: "$0 software",
    note: "get_ai_visibility and record_ai_citations are two more tools on the bearer token that already runs rank tracking.",
  },
] as const;

export function AiVisibilityLandscapeScorecard() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Vendor</Th>
          <Th>Model</Th>
          <Th>Price</Th>
          <Th>Note</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.vendor}>
              <Td className="font-medium text-neutral-100">{r.vendor}</Td>
              <Td className="text-neutral-400">{r.model}</Td>
              <Td className="font-medium text-neutral-100">{r.price}</Td>
              <Td className="text-neutral-400">{r.note}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
