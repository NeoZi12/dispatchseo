// This site's own publishing record: guide files per month (counted from the
// frontmatter dates in src/content/blog on 2026-10-10) next to the 27 days of
// Search Console data returned by get_site_stats the same day. Counts are DOM
// text; the bars are decoration under the numbers.

import { StatRow, BigStatTile } from "@/components/ui";

const MONTHS = [
  { label: "July", n: 15 },
  { label: "August", n: 30 },
  { label: "September", n: 22 },
  { label: "October (to the 10th)", n: 8 },
] as const;

export function OwnSitePublishingVolumeStats() {
  const max = Math.max(...MONTHS.map((m) => m.n));
  return (
    <div className="not-prose my-6 space-y-3">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Guides published per month on dispatchseo.com</p>
        <ul className="mt-3 space-y-2">
          {MONTHS.map((m) => (
            <li key={m.label} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 text-neutral-400">{m.label}</span>
              <span className="h-2 flex-1 rounded-full bg-neutral-800">
                <span className="block h-2 rounded-full bg-violet-500" style={{ width: `${(m.n / max) * 100}%` }} />
              </span>
              <span className="w-8 text-right font-mono tabular-nums text-neutral-100">{m.n}</span>
            </li>
          ))}
        </ul>
      </div>
      <StatRow cols={3}>
        <BigStatTile title="Guides in the repo" value="75" sub="37 of them about Claude Code or MCP, now off-topic" />
        <BigStatTile title="Impressions, 27 days" value="278" sub="Search Console, to 2026-10-08" />
        <BigStatTile title="Clicks, 27 days" value="11" sub="almost all on the homepage" />
      </StatRow>
    </div>
  );
}
