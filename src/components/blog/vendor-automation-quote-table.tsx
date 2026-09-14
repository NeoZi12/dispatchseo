// What each vendor's own current site says about what ships without a
// person - Surfer, SEO.AI, and Outrank checked live during the session that
// wrote this guide (surferseo.com, seo.ai, outrank.so), DispatchSEO's row is
// this repo's own pipeline. Direct quotes are marked as such; the rest is
// this session's own reading of the page, not a re-run of another roundup's
// summary.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    product: "Surfer",
    tier: "Assist",
    ships: "Nothing - content stays in Surfer's own editor until you export it",
    source: "Markets itself around a Content Editor, AI Outline, and an AI Tracker; no publishing integration listed on its homepage.",
  },
  {
    product: "SEO.AI",
    tier: "Autonomous, review optional",
    ships: "Full articles - auto-publish is the default path",
    source: '"New articles go live automatically. No coordination. No manual uploads."',
  },
  {
    product: "Outrank",
    tier: "Autonomous, review optional",
    ships: "Full articles pushed through a connected CMS integration",
    source: '"We create and publish SEO-optimized articles from your plan every day. Your blog grows automatically." (a review step exists, but it’s opt-in.)',
  },
  {
    product: "DispatchSEO",
    tier: "Reviewed pipeline",
    ships: "Nothing - every draft stops at a pull request",
    source: "This guide itself: drafted by an agent, opened as a PR, merged by a person before it went live.",
  },
] as const;

export function VendorAutomationQuoteTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Product</Th>
          <Th>Tier</Th>
          <Th>What ships without a person</Th>
          <Th>From its own site, checked live</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.product}>
              <Td className="font-medium text-neutral-100">{r.product}</Td>
              <Td>{r.tier}</Td>
              <Td>{r.ships}</Td>
              <Td className="text-neutral-400">{r.source}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
