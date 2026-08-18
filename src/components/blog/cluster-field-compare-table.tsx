// Five tools actually holding page 1 for "best keyword clustering tool",
// checked directly on each one's own current page while writing this guide
// (2026-08-18) - not summarized from a roundup. The "after the list" column
// is the whole point of the guide: quoted or closely paraphrased from what
// each tool's own page says happens once you have your clusters.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    tool: "SE Ranking Keyword Grouper",
    price: "Paid - Core plan from $103.20/mo",
    output: "Grouped keywords, named by top-volume term",
    after: "Stops at the list; a separate Content Editor add-on covers writing",
  },
  {
    tool: "ryrob.com Keyword Cluster Tool",
    price: "Free, rate-limited hourly",
    output: "Keyword map - image or CSV export",
    after: "Suggests using clusters \"when outlining a post\"; upsells RightBlogger",
  },
  {
    tool: "KeySearch Keyword Cluster Tool",
    price: "Free standalone",
    output: "Related-term groups by shared intent",
    after: "\"Use each cluster to guide\" one post per cluster - you write it",
  },
  {
    tool: "SEO.AI Topic Cluster Tool",
    price: "Free, no login",
    output: "Pillar topic + subtopic clusters",
    after: "You build the pillar page and each subtopic piece yourself",
  },
  {
    tool: "DispatchSEO's own free tool",
    price: "Free, runs in the browser",
    output: "Same-page / sections / standalone verdict per pair",
    after: "Same wall as the rest - see why below",
  },
] as const;

export function ClusterFieldCompareTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Tool</Th>
          <Th>Price</Th>
          <Th>Output</Th>
          <Th>After you have the clusters</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.tool}>
              <Td className="font-medium text-neutral-100">{r.tool}</Td>
              <Td>{r.price}</Td>
              <Td>{r.output}</Td>
              <Td>{r.after}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Checked directly on each tool&apos;s own current page, not a roundup&apos;s summary of it - the
        two review posts also on page 1 (lowfruits.io, keywordinsights.ai) catalogue more tools than
        this, but neither one checks what happens after the list the way this row does.
      </p>
    </div>
  );
}
