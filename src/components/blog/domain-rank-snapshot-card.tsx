// This project's own DR-equivalent snapshot - pulled live via get_domain_rank
// during the session that wrote this guide. Shown explicitly as a DIFFERENT
// metric from Moz's Domain Authority (different index, different algorithm,
// not a comparable score), not a stand-in for one.

import { StatRow, BigStatTile } from "@/components/ui";

export function DomainRankSnapshotCard() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        dispatchseo.com, get_domain_rank, 2026-08-03 - 24 days old
      </h3>
      <div className="mt-3">
        <StatRow cols={4}>
          <BigStatTile title="DR-equivalent" value="0" />
          <BigStatTile title="Referring domains" value="2" />
          <BigStatTile title="Backlinks" value="59" />
          <BigStatTile title="Spam score" value="0" />
        </StatRow>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        This is DataForSEO&apos;s own domain-rank metric, from the same account this project&apos;s
        rank and backlink data already comes from - not a DA-equivalent DispatchSEO computes, and not
        directly comparable to Moz&apos;s own 1-100 score. Neither number is something Google itself
        publishes; both are one vendor&apos;s opinion of a site&apos;s link profile.
      </p>
    </div>
  );
}
