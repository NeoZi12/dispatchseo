// What this project's own self-hosted stack actually charges for, piece by
// piece - sourced from this repo's own CLAUDE.md and get_project's keyword
// source options (dataforseo/serpapi/gsc), not a competitor's pricing page.

import { TableShell, THead, Th, Tr, Td } from "@/components/ui";

const ROWS = [
  {
    piece: "Rank checks (SerpApi tier)",
    cost: "Free - 250 checks/mo",
    why: "SerpApi's own free tier, no card required to start",
  },
  {
    piece: "Google Search Console sync",
    cost: "Free forever",
    why: "Google's own API, your own verified property - no rate limit that matters at one-site scale",
  },
  {
    piece: "Content pipeline (research → draft → PR)",
    cost: "Free",
    why: "Runs on the Claude Code or Codex subscription you already pay for - no separate generation fee",
  },
  {
    piece: "Hosting (Vercel Hobby + Supabase + GitHub)",
    cost: "Free tier, by default",
    why: "Hobby's cron limits are why this pipeline splits schedules across two runners instead of one",
  },
  {
    piece: "Keyword volume + difficulty",
    cost: "Paid, billed to you",
    why: "DataForSEO meters per call to your own account - not marked up, not bundled into a seat",
  },
] as const;

export function FreeVsPaidStackTable() {
  return (
    <div className="not-prose my-6">
      <TableShell>
        <THead>
          <Th>Piece</Th>
          <Th>Cost</Th>
          <Th>Why</Th>
        </THead>
        <tbody>
          {ROWS.map((r) => (
            <Tr key={r.piece}>
              <Td className="font-medium text-neutral-100">{r.piece}</Td>
              <Td className={r.cost.startsWith("Paid") ? "text-amber-300" : "text-emerald-400"}>{r.cost}</Td>
              <Td className="text-neutral-400">{r.why}</Td>
            </Tr>
          ))}
        </tbody>
      </TableShell>
    </div>
  );
}
