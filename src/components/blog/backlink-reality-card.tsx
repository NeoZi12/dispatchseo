// This project's own DR-equivalent, referring domains, and backlink count -
// pulled live via get_domain_rank during the session that wrote this guide.
// Real, unflattering numbers for a 8-day-old domain, set against what a
// crawl-scale backlink index (Ahrefs' actual product) covers that a single
// project's own DataForSEO account never will.

import { StatRow, BigStatTile } from "@/components/ui";

export function BacklinkRealityCard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          This project&apos;s own account, right now
        </h3>
        <div className="mt-3">
          <StatRow cols={3}>
            <BigStatTile title="DR-equivalent" value="0" />
            <BigStatTile title="Referring domains" value="0" />
            <BigStatTile title="Backlinks" value="0" />
          </StatRow>
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          get_domain_rank, dispatchseo.com, 2026-07-24 - a brand-new domain with no links yet, not a
          product limitation.
        </p>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
          What a crawl-scale index adds that this never will
        </h3>
        <ul className="mt-3 space-y-2 text-sm text-neutral-300">
          <li>A backlink count for a domain you don&apos;t own or haven&apos;t connected</li>
          <li>Discovering who links to a competitor, not just to you</li>
          <li>Historical link data older than the account has existed</li>
        </ul>
      </div>
    </div>
  );
}
