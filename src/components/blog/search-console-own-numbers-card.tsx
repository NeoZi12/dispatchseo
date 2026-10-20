// This site's own Search Console totals for the 29 daily snapshots from
// 2026-09-22 to 2026-10-20, pulled by the run that wrote the guide with
// get_site_stats. Unflattering on purpose. Every number is also in the prose.

import { StatRow, BigStatTile } from "@/components/ui";

const ROWS = [
  { page: "dispatchseo.com/ (homepage)", clicks: "7 of 7", position: "about 1 to 8", note: "Every click this month, mostly on the brand name" },
  { page: "/blog/ahrefs-alternative", clicks: "0", position: "mostly 80 to 87", note: "43 impressions, none of them clicked" },
  { page: "/blog/mangools-alternative", clicks: "0", position: "about 2 to 68", note: "Position 2 on one day, 67 on another" },
] as const;

export function SearchConsoleOwnNumbersCard() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile title="Clicks" value="7" sub="29 snapshots, 2026-09-22 to 2026-10-20." />
        <BigStatTile title="Impressions" value="206" sub="106 of them (51%) on three days, 10-06 to 10-08." />
        <BigStatTile title="Days with zero" value="5" sub="Five snapshots reported no impressions at all." />
      </StatRow>
      <div className="mt-3 overflow-x-auto rounded-xl bg-neutral-900">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-neutral-500">
              <th className="p-4 font-medium">Page</th>
              <th className="p-4 font-medium">Clicks</th>
              <th className="p-4 font-medium">Daily position</th>
              <th className="p-4 font-medium">What it shows</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.page} className="border-t border-neutral-800 align-top">
                <td className="p-4 font-semibold text-neutral-100">{r.page}</td>
                <td className="p-4 text-violet-400">{r.clicks}</td>
                <td className="p-4 text-neutral-300">{r.position}</td>
                <td className="p-4 text-neutral-300">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        get_site_stats, read 2026-10-20. A months-old domain, not a broken one.
      </p>
    </div>
  );
}
