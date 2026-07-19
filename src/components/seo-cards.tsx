// Presentational analytics cards shared by the Analytics page and the Home
// summary, so both surfaces render identically. Same dashboard grammar as
// ui.tsx (neutral-900 cards, color as meaning, hand-rolled SVG meters).

import { Arrow, EmptyState, TableShell, Td, Th, THead, Tr } from "./ui";
import { NextUpdate } from "./next-update";
import type { DomainRating } from "@/lib/domain-rating";
import type { PageRow, RankingRow } from "@/lib/analytics-data";
import type { PageBucket, SitePageRow, TrafficBreakdown } from "@/lib/metrics";

export function fmtInt(n: number): string {
  return n.toLocaleString("en-US");
}
export function fmtPos(p: number | null): string {
  return p == null ? "-" : p.toFixed(1);
}
export function fmtPct(n: number | null): string {
  return n == null ? "-" : `${(n * 100).toFixed(1)}%`;
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function DomainRatingCard({ dr }: { dr: DomainRating | null }) {
  const value = dr?.dr;
  const hasValue = value != null;
  const pct = hasValue ? Math.max(0, Math.min(100, value)) : 0;
  const spammy = dr?.spamScore != null && dr.spamScore > 30;
  // DR runs on its own 24h cache, not the daily cron - the timer counts from
  // when the cached API call actually fired.
  const nextRefresh = dr?.fetchedAt
    ? new Date(Date.parse(dr.fetchedAt) + 86_400_000).toISOString()
    : null;

  return (
    <div className="rounded-xl bg-neutral-900 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-neutral-400">
            Domain Rating
            {nextRefresh ? (
              <span className="ml-2">
                <NextUpdate at={nextRefresh} />
              </span>
            ) : null}
          </p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-semibold tabular-nums">{hasValue ? value : "-"}</span>
            <span className="text-sm text-neutral-500">/ 100</span>
          </p>
        </div>
        <div className="flex gap-8 text-right">
          <div>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {dr?.referringDomains != null ? fmtInt(dr.referringDomains) : "-"}
            </p>
            <p className="text-xs text-neutral-400">referring domains</p>
          </div>
          <div>
            <p className="text-4xl font-semibold tabular-nums tracking-tight">
              {dr?.backlinks != null ? fmtInt(dr.backlinks) : "-"}
            </p>
            <p className="text-xs text-neutral-400">backlinks</p>
          </div>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-3 text-xs text-neutral-400">
        {!hasValue
          ? "Not available yet - grows as sites start linking to you."
          : value === 0
            ? "No backlinks indexed yet. This climbs as you earn links from other sites."
            : "Ahrefs-style authority score (0-100), from your live backlink profile."}
        {spammy ? (
          <span className="ml-2 text-amber-300">spam score {dr?.spamScore}% - worth a look</span>
        ) : null}
      </p>
    </div>
  );
}

export function TrafficTable({
  rows,
  itemLabel = "Page",
}: {
  rows: PageRow[];
  itemLabel?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState>Nothing here yet. Pages show up once the manager builds them.</EmptyState>;
  }
  return (
    <TableShell>
      <THead>
        <Th>{itemLabel}</Th>
        <Th className="hidden text-right md:table-cell">Published</Th>
        <Th className="hidden text-right sm:table-cell">Clicks</Th>
        <Th className="text-right">Impressions</Th>
        <Th className="hidden text-right sm:table-cell">Avg position</Th>
      </THead>
      <tbody>
        {rows.map((p) => (
          <Tr key={p.id}>
            <Td>
              <a
                href={p.url}
                target="_blank"
                className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
              >
                {p.title ?? p.url}
              </a>
              {p.primary_keyword ? (
                <span className="ml-2 hidden text-xs text-neutral-500 md:inline">{p.primary_keyword}</span>
              ) : null}
              <span className="mt-0.5 block text-xs text-neutral-500 sm:hidden">
                {fmtInt(p.clicks)} clicks · pos {fmtPos(p.avgPosition)}
              </span>
            </Td>
            <Td className="hidden whitespace-nowrap text-right text-neutral-400 md:table-cell">
              {fmtDate(p.published_at ?? p.created_at)}
            </Td>
            <Td className="hidden text-right tabular-nums sm:table-cell">{fmtInt(p.clicks)}</Td>
            <Td className="text-right tabular-nums text-neutral-300">{fmtInt(p.impressions)}</Td>
            <Td className="hidden text-right tabular-nums text-neutral-300 sm:table-cell">
              {fmtPos(p.avgPosition)}
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  );
}

// ---------- Traffic by page (whole-site breakdown) ----------
// PostHog-Paths-style panel: every path Google sent traffic to - built pages
// AND everything else - so the numbers finally reconcile with the site total
// instead of silently dropping the homepage and hand-written posts. Rows show
// the bare path only and everything renders in one color (owner's call - the
// per-bucket colors and the stacked share bar read as noise). The fill bar
// behind each path scales to the busiest row (not the site total) so the top
// page always reads full-width even on a young, low-traffic site.

const BUCKET_ORDER: PageBucket[] = ["guide", "tool", "homepage", "other"];

const BUCKET_LABEL: Record<PageBucket, string> = {
  guide: "Guides we built",
  tool: "Tools we built",
  homepage: "Homepage",
  other: "Your other pages",
};

// The plain-English count line under each strip number. Homepage is always
// one page, so its line explains the traffic instead of counting.
function bucketSub(b: PageBucket, pages: number): string {
  const n = `${fmtInt(pages)} page${pages === 1 ? "" : "s"}`;
  if (b === "homepage") return "people who googled you directly";
  if (b === "other") return `${n} written outside DispatchSEO`;
  return n;
}

// One table row. Raw <tr>/<td> (not Tr/Td) because collapsed rows need extra
// visibility classes and the path cell needs `relative` for the fill bar -
// the class strings mirror ui.tsx's Tr/Td exactly.
function SitePageTr({
  row,
  maxClicks,
  collapsed,
}: {
  row: SitePageRow;
  maxClicks: number;
  collapsed?: boolean;
}) {
  return (
    <tr
      className={`border-t border-neutral-800/70 hover:bg-neutral-800/30 ${
        collapsed ? "hidden group-has-[input:checked]/tbp:table-row" : ""
      }`}
    >
      <td className="relative px-4 py-3">
        {/* Proportional fill behind the path, PostHog-style. One quiet
            neutral for every row - color is reserved for the bucket strip.
            Skipped at zero clicks so the long tail stays visually silent. */}
        {row.clicks > 0 ? (
          <div
            aria-hidden="true"
            className="absolute inset-y-1 left-0 rounded-r bg-neutral-400/10"
            style={{ width: `${Math.max(2, (row.clicks / maxClicks) * 100)}%` }}
          />
        ) : null}
        <div className="relative">
          <a
            href={row.url}
            target="_blank"
            className="text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            {/* The bare "/" path reads like a glitch - say Homepage. */}
            {row.bucket === "homepage" ? "Homepage" : row.path}
          </a>
          <span className="mt-0.5 block text-xs text-neutral-500 sm:hidden">
            {fmtInt(row.clicks)} clicks · pos {fmtPos(row.avgPosition)}
          </span>
        </div>
      </td>
      <td className="hidden px-4 py-3 text-right tabular-nums sm:table-cell">
        {fmtInt(row.clicks)}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{fmtInt(row.impressions)}</td>
      <td className="hidden px-4 py-3 text-right tabular-nums text-neutral-300 sm:table-cell">
        {fmtPos(row.avgPosition)}
      </td>
    </tr>
  );
}

export function TrafficByPage({
  breakdown,
  maxRows,
}: {
  breakdown: TrafficBreakdown;
  // Hard cap on rows shown before the "show more" toggle - Home passes 5 to
  // stay a teaser; Analytics omits it for the click-aware default below.
  maxRows?: number;
}) {
  const { rows, buckets, total, unattributed } = breakdown;
  if (rows.length === 0) {
    return (
      <EmptyState>
        No page-level search data yet. Rows appear once Google reports which pages earned
        impressions.
      </EmptyState>
    );
  }

  // Long-tail below GSC's stored per-day cutoff - usually zero, so the fifth
  // strip entry and the "+ long-tail" reconciliation only render when real.
  const showUnattributed = unattributed.clicks > 0 || unattributed.impressions > 0;
  const maxClicks = Math.max(...rows.map((r) => r.clicks), 1);
  const foldClicks = rows.reduce((a, r) => a + r.clicks, 0);

  // Keep the table scannable: every row that earned a click stays visible,
  // plus enough of the zero-click tail to reach ten rows; the rest collapses
  // behind the toggle. Collapsing one or two rows isn't worth a click, so
  // small remainders just render outright.
  const clickedCount = rows.filter((r) => r.clicks > 0).length;
  const cut = maxRows ?? Math.max(clickedCount, 10);
  // With an explicit cap, honor it exactly; the default only collapses when
  // it saves 3+ rows (hiding one or two isn't worth a click).
  const collapse = rows.length - cut >= (maxRows != null ? 1 : 3);
  const visible = collapse ? rows.slice(0, cut) : rows;
  const hidden = collapse ? rows.slice(cut) : [];

  return (
    <div className="space-y-3">
      {/* Bucket strip: where the clicks come from, reconciling to the site
          total. Numbers only - no share bar, no per-bucket colors. */}
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div
          className={`grid grid-cols-2 gap-4 ${
            showUnattributed ? "sm:grid-cols-5" : "sm:grid-cols-4"
          }`}
        >
          {BUCKET_ORDER.map((b) => (
            <div key={b}>
              <p className="text-sm font-medium text-neutral-100">{BUCKET_LABEL[b]}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight">{fmtInt(buckets[b].clicks)}</p>
              <p className="text-xs text-neutral-400">clicks · {bucketSub(b, buckets[b].pages)}</p>
            </div>
          ))}
          {showUnattributed ? (
            <div>
              <p className="text-sm font-medium text-neutral-100">Smaller pages</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-neutral-300">
                {fmtInt(unattributed.clicks)}
              </p>
              <p className="text-xs text-neutral-400">
                clicks from pages too small for Google&apos;s daily report
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* The expander is a hidden checkbox + group-has, not <details> - a
          <details> can't wrap table rows without breaking column alignment,
          and this stays just as server-only/zero-JS. */}
      <div className="group/tbp">
        <TableShell>
          <THead>
            <Th>Path</Th>
            <Th className="hidden text-right sm:table-cell">Clicks</Th>
            <Th className="text-right">Impressions</Th>
            <Th className="hidden text-right sm:table-cell">Avg position</Th>
          </THead>
          <tbody>
            {visible.map((r) => (
              <SitePageTr key={r.path} row={r} maxClicks={maxClicks} />
            ))}
            {hidden.map((r) => (
              <SitePageTr key={r.path} row={r} maxClicks={maxClicks} collapsed />
            ))}
            {hidden.length > 0 ? (
              <tr className="border-t border-neutral-800/70">
                <td colSpan={4} className="px-4 py-2.5">
                  <label className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300 has-[input:focus-visible]:text-neutral-200 has-[input:focus-visible]:underline">
                    <input type="checkbox" className="sr-only" />
                    <span className="group-has-[input:checked]/tbp:hidden">
                      show {hidden.length} more page{hidden.length === 1 ? "" : "s"}
                    </span>
                    <span className="hidden group-has-[input:checked]/tbp:inline">
                      show fewer pages
                    </span>
                  </label>
                </td>
              </tr>
            ) : null}
          </tbody>
        </TableShell>
      </div>

      {/* The reconciliation line - the whole reason this section exists. */}
      <p className="text-xs text-neutral-400">
        {showUnattributed ? (
          <>
            The {fmtInt(rows.length)} pages listed here got {fmtInt(foldClicks)} clicks; another{" "}
            {fmtInt(unattributed.clicks)} came from pages too small for Google&apos;s daily report
            — {fmtInt(total.clicks)} clicks in total.
          </>
        ) : (
          <>
            All {fmtInt(rows.length)} pages Google showed your site for are listed here —{" "}
            {fmtInt(total.clicks)} clicks and {fmtInt(total.impressions)} impressions in total.
          </>
        )}
      </p>
    </div>
  );
}

export function RankingsTable({ rankings, limit }: { rankings: RankingRow[]; limit?: number }) {
  if (rankings.length === 0) {
    return <EmptyState>No keywords tracked yet.</EmptyState>;
  }
  const rows = limit ? rankings.slice(0, limit) : rankings;
  return (
    <TableShell>
      <THead>
        <Th>Keyword</Th>
        <Th className="text-right">Position</Th>
        <Th className="hidden text-right sm:table-cell">30d</Th>
        <Th className="hidden text-right sm:table-cell">Volume</Th>
      </THead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.keyword.id}>
            <Td>{r.keyword.keyword}</Td>
            <Td className="text-right tabular-nums">
              {r.current == null ? (
                <span className="text-neutral-600">-</span>
              ) : (
                <span
                  className={
                    r.current <= 3
                      ? "text-emerald-400"
                      : r.current <= 10
                        ? "text-neutral-200"
                        : "text-neutral-400"
                  }
                >
                  {r.current}
                </span>
              )}
            </Td>
            <Td className="hidden text-right sm:table-cell">
              <Arrow delta={r.change} />
            </Td>
            <Td className="hidden text-right tabular-nums text-neutral-300 sm:table-cell">
              {r.volume != null ? fmtInt(r.volume) : "-"}
            </Td>
          </Tr>
        ))}
      </tbody>
    </TableShell>
  );
}
