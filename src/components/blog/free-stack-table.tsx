// The actual tools page 1 recommends for "semrush alternative free", with
// their real current limits - verified live against each tool's own site
// during the session that wrote this guide (ahrefs.com/webmaster-tools,
// business.google.com's Keyword Planner page), not copied from another
// listicle. Answer Socrates' description matches this exact SERP's own AI
// overview, which named it directly.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tool: "Google Search Console",
    covers: "Your own site's clicks, impressions, queries, and ranking position",
    limit: "Only your own verified property - zero visibility into any competitor",
  },
  {
    tool: "Google Keyword Planner",
    covers: "Keyword ideas and volume, pulled from Google's own ad-auction data",
    limit: "Free, but gated: Google requires a Google Ads account and a created campaign before it opens",
  },
  {
    tool: "Ahrefs Webmaster Tools",
    covers: "Site audit (170+ checks), backlink data, and organic traffic for one site",
    limit: "1,000 backlinks and 1,000 keywords visible per verified site, 5,000 monthly crawl credits - and only sites you've verified, never a competitor's",
  },
  {
    tool: "Mangools (free tier)",
    covers: "Keyword and backlink lookups in one dashboard",
    limit: "A capped number of free lookups, not an unmetered plan - the free tier exists to sell the paid one",
  },
  {
    tool: "Ubersuggest",
    covers: "Keyword and content ideas",
    limit: "Same shape as Mangools: a capped number of free lookups before it asks for a card",
  },
  {
    tool: "Google Trends",
    covers: "Relative interest over time between terms",
    limit: "Comparative only - no absolute volume, no site-specific number at all",
  },
  {
    tool: "Answer Socrates",
    covers: "Clusters the actual questions people ask around a topic",
    limit: "Free, but narrow - one job, nothing else in the Semrush bundle",
  },
] as const;

export function FreeStackTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Tool</Th>
          <Th>What it covers</Th>
          <Th>The real limit</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tool}>
              <Td className="font-medium text-neutral-100">{r.tool}</Td>
              <Td>{r.covers}</Td>
              <Td className="text-neutral-400">{r.limit}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
