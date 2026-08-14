// This project's own build pace, counted straight from get_pages and
// get_project during the session that wrote this guide - real totals, not a
// rounded pitch number. This guide is the one that pushes the guide count to
// 28, on the domain's own 28th day.

import { StatRow, BigStatTile } from "@/components/ui";

export function JudgmentModelPaceFactRow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_pages, as of this build - no dataset, no template merge
      </h3>
      <div className="mt-3">
        <StatRow cols={3}>
          <BigStatTile title="Guides shipped" value="27" />
          <BigStatTile title="Free tools shipped" value="5" />
          <BigStatTile title="Domain age" value="28d" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Every one of those 32 pages was a separate keyword, researched and decided on its own - this
        guide is the 28th, built on the domain&apos;s own 28th day. Nothing here was merged from a
        spreadsheet; the count is just what one page a day adds up to.
      </p>
    </div>
  );
}
