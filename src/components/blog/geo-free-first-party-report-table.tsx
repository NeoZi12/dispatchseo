// What the two search engines' own free reports cover for AI answers, taken
// from Google's AI optimization guide and Bing's AI Performance help page
// (fetched while writing the guide). Shows the measurement job is already
// partly free before any paid GEO tool enters the picture.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    report: "Generative AI performance report",
    owner: "Google Search Console",
    shows: "How your content performs in generative AI features on Google Search and Discover",
    gap: "Not a per-prompt log of which sources an answer named instead of you",
  },
  {
    report: "AI Performance",
    owner: "Bing Webmaster Tools",
    shows: "Total citations, per-page citation counts, grounding queries, trend over time; citation share in preview",
    gap: "Microsoft Copilot and partner surfaces only; a citation is not a click",
  },
] as const;

export function GeoFreeFirstPartyReportTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Report</Th>
          <Th>What it shows</Th>
          <Th>What it leaves out</Th>
        </THead>
        {ROWS.map((r) => (
          <Tr key={r.report}>
            <Td>
              <span className="text-neutral-100">{r.report}</span>
              <span className="block text-xs text-neutral-500">{r.owner}, free</span>
            </Td>
            <Td>{r.shows}</Td>
            <Td>{r.gap}</Td>
          </Tr>
        ))}
      </TableShell>
    </div>
  );
}
