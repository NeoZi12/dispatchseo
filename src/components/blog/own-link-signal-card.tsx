// This project's own get_domain_rank snapshot, pulled live while writing
// this guide. Shown explicitly as a DIFFERENT index from Majestic's Trust
// Flow / Citation Flow - a different crawl, a different algorithm, not a
// comparable score - not a stand-in for one.

import { StatRow, BigStatTile } from "@/components/ui";

export function OwnLinkSignalCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_domain_rank, 2026-08-10
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="DR-equivalent" value="0" />
          <BigStatTile title="Referring domains" value="4" />
          <BigStatTile title="Backlinks" value="59" />
          <BigStatTile title="Spam score" value="0" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        This comes from the same DataForSEO account already behind this project&apos;s rank and
        keyword data - not Trust Flow or Citation Flow, and not on Majestic&apos;s scale. Majestic
        built its index by crawling the web for over a decade; a 24-day-old project reading its own
        account was never going to produce a comparable number, which is exactly why this guide
        doesn&apos;t pretend to replace the index Majestic sells.
      </p>
    </div>
  );
}
