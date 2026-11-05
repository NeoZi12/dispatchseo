"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ClickIcon, RowArrow, RowLink, SearchIcon, compact } from "@/components/ui/overview-chart";
import { cx, FOCUS_RING } from "@/components/ui/styles";

// Analytics' three lists, as client components for weight: the RSC payload
// carries the rows as compact data instead of a markup tree per row, and
// rows behind "Show more" aren't rendered until asked for.
//
// They speak the same language as Home's "Your top posts"
// (ui/overview-chart.tsx LandedList): rows, not a boxed table; a rank chip
// on the left (green for the top three); the name with a faint line under
// it; then fixed-width columns on the right, each a number over a tiny
// label, so figures line up row to row and section to section. The figure
// that matters most in each list is the biggest. Under 640px the secondary
// columns fold into the line under the lead figure.

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
const spot = (p: number | null) => (p == null ? "-" : `#${Math.max(1, Math.round(p))}`);
const LABEL = "mt-0.5 block text-[11px] font-medium uppercase tracking-wider text-ink-faint";
const ROW = "flex items-center gap-4 rounded-xl px-3 py-3.5 sm:gap-5";
/** Rows that rise in on first paint; the rest (and any shown later) are simply there. */
const ARRIVING = 8;

/** The entrance for row i of a list whose section arrives at `at` ms. */
function arrive(i: number, at: number) {
  return i < ARRIVING ? { className: "arrive-up", style: css({ "--at": `${at + 80}ms`, "--i": i, "--step": "45ms" }) } : {};
}

function RankChip({ n, podium }: { n: number; podium: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[14px] font-semibold tabular-nums",
        podium ? "bg-ok/12 text-ok ring-1 ring-ok/25" : "bg-surface-3/70 text-ink-faint",
      )}
    >
      {n}
    </span>
  );
}

/** A secondary figure: its own fixed column from 640px up, hidden below
 *  (the lead column's label carries it there). */
function Side({ value, label, width, icon }: { value: string; label: string; width: string; icon?: React.ReactNode }) {
  return (
    <span className={cx("hidden shrink-0 text-center sm:block", width)}>
      <span className="flex items-center justify-center gap-1.5">
        {icon}
        <span className="text-[1.125rem] font-semibold leading-7 tabular-nums text-ink-muted">{value}</span>
      </span>
      <span className={LABEL}>{label}</span>
    </span>
  );
}

/** The figure that matters: biggest, right-aligned, one size on every row. */
function Lead({ value, label, icon, strong, tone, folded }: { value: string; label: string; icon?: React.ReactNode; strong: boolean; tone?: string; folded?: string }) {
  return (
    <span className="w-24 shrink-0 text-right">
      <span className="flex items-center justify-end gap-1.5">
        {icon}
        <span className={cx("text-[1.625rem] font-semibold leading-7 tracking-tight tabular-nums", tone ?? (strong ? "text-ink" : "text-ink-muted"))}>{value}</span>
      </span>
      <span className={LABEL}>
        {label}
        {folded ? <span className="sm:hidden"> · {folded}</span> : null}
      </span>
    </span>
  );
}

const clickIcon = (strong: boolean) => <ClickIcon className={cx("h-[18px] w-[18px] shrink-0", strong ? "text-ok" : "text-ink-faint")} />;
const searchIcon = <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />;

/** The arrow column of a linked row; an empty one keeps unlinked rows' figures in line. */
function OutArrow({ show }: { show: boolean }) {
  return show ? (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-ink-faint transition-[color,transform] duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ok"
    >
      <path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <span aria-hidden="true" className="h-4 w-4 shrink-0" />
  );
}

function FoldButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx("rounded-sm text-[13px] font-medium text-accent", FOCUS_RING)}>
      {children}
    </button>
  );
}

export type LandedRow = {
  path: string;
  url: string;
  title: string | null;
  clicks: number;
  impressions: number;
  position: number | null;
  gone: boolean;
  /** The article's own dashboard page, when the page is one of ours. */
  href?: string | null;
};

/** Where Google's clicks landed. A page we know no longer loads keeps its
 *  row and clicks (the totals still add up) but is marked "Gone", isn't
 *  linked, and isn't counted as bringing people in. Pages with clicks
 *  always show; the quiet tail folds away after ten (40 more at most). */
export function LandedTable({ rows, at = 0 }: { rows: LandedRow[]; at?: number }) {
  const [more, setMore] = useState(false);
  if (!rows.length) return <EmptyState title="No page data yet">Rows appear once Google reports which pages it showed.</EmptyState>;
  const earning = rows.filter((r) => r.clicks > 0 && !r.gone).length;
  const goneCount = rows.filter((r) => r.gone).length;
  const cut = Math.max(rows.filter((r) => r.clicks > 0).length, 10);
  const shown = more ? rows.slice(0, cut + 40) : rows.slice(0, cut);
  const extra = Math.min(rows.length - cut, 40);
  return (
    <div className="space-y-3">
      <p className="text-[14px] text-ink-muted">
        <span className="font-medium text-ink">{earning}</span> {earning === 1 ? "page" : "pages"} brought people in
        {goneCount ? `. ${goneCount} ${goneCount === 1 ? "page is" : "pages are"} no longer on your site.` : "."}
      </p>
      <ol className="-mx-3 space-y-1" aria-label="Pages people opened from Google, last 28 days">
        {shown.map((r, i) => {
          const podium = i < 3 && r.clicks > 0 && !r.gone;
          const name = r.title ?? r.path;
          const body = (
            <>
              <RankChip n={i + 1} podium={podium} />
              <span className="min-w-0 flex-1">
                <span className="sr-only">Number {i + 1}: </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cx("truncate text-[15px] font-medium transition-colors", r.gone ? "text-ink-muted" : "text-ink group-hover:text-ok")}
                    title={name}
                  >
                    {name}
                  </span>
                  {r.gone ? <span className="shrink-0 rounded bg-surface-3 px-1.5 py-0.5 text-[11.5px] font-medium text-ink-muted">Gone</span> : null}
                </span>
                {r.title ? (
                  <span className="mt-1 block truncate text-[12.5px] text-ink-faint" title={r.path}>
                    {r.path}
                  </span>
                ) : null}
              </span>
              <Side value={spot(r.position)} label="On Google" width="w-20" />
              <Side value={compact(r.impressions)} label="Impressions" width="w-28" icon={searchIcon} />
              <Lead
                value={r.clicks.toLocaleString("en-US")}
                label={r.clicks === 1 ? "Click" : "Clicks"}
                icon={clickIcon(podium)}
                strong={podium}
                folded={`${compact(r.impressions)} impressions${r.position == null ? "" : ` · ${spot(r.position)}`}`}
              />
              {r.href ? <RowArrow external={false} /> : <OutArrow show={!r.gone} />}
              {r.gone || r.href ? null : <span className="sr-only">(opens the page in a new tab)</span>}
            </>
          );
          return (
            <li key={r.path} {...arrive(i, at)}>
              {r.gone && !r.href ? (
                <div className={ROW}>{body}</div>
              ) : (
                <RowLink href={r.href ?? r.url} external={!r.href} className={cx("group transition-colors hover:bg-surface-2", ROW, FOCUS_RING)}>
                  {body}
                </RowLink>
              )}
            </li>
          );
        })}
      </ol>
      {extra > 0 ? (
        <FoldButton onClick={() => setMore((v) => !v)}>{more ? "Show fewer" : `Show ${extra} more ${extra === 1 ? "page" : "pages"}`}</FoldButton>
      ) : null}
      {more && rows.length > cut + 40 ? <p className="text-[13px] text-ink-faint">And {rows.length - cut - 40} smaller pages.</p> : null}
    </div>
  );
}

export type QueryRow = { query: string; clicks: number; impressions: number; position: number | null };

/** How many searches show before "Show all". */
const QUERIES_SHOWN = 10;

/** What people typed before they found the site, most clicks first. A long
 *  search wraps to two lines, then ends in an ellipsis (the full text is
 *  its tooltip). Not linked: there is nothing of ours to open. */
export function QueriesTable({ rows, at = 0 }: { rows: QueryRow[]; at?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, QUERIES_SHOWN);
  return (
    <div className="space-y-3">
      <ol className="-mx-3 space-y-1" aria-label="Top searches, last 28 days">
        {shown.map((q, i) => {
          const podium = i < 3 && q.clicks > 0;
          return (
            <li key={q.query} className={cx(arrive(i, at).className, ROW)} style={arrive(i, at).style}>
              <RankChip n={i + 1} podium={podium} />
              <span className="min-w-0 flex-1">
                <span className="sr-only">Number {i + 1}: </span>
                <span className="line-clamp-2 text-[15px] font-medium leading-snug break-words text-ink" title={q.query}>
                  {q.query}
                </span>
              </span>
              <Side value={spot(q.position)} label="On Google" width="w-20" />
              <Side value={compact(q.impressions)} label="Impressions" width="w-28" icon={searchIcon} />
              <Lead
                value={q.clicks.toLocaleString("en-US")}
                label={q.clicks === 1 ? "Click" : "Clicks"}
                icon={clickIcon(podium)}
                strong={podium}
                folded={`${compact(q.impressions)} impressions${q.position == null ? "" : ` · ${spot(q.position)}`}`}
              />
              <OutArrow show={false} />
            </li>
          );
        })}
      </ol>
      {rows.length > QUERIES_SHOWN ? (
        <FoldButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length} searches`}</FoldButton>
      ) : null}
    </div>
  );
}

export type RankRow = {
  id: string;
  keyword: string;
  /** Spot on Google; null = outside the top 100 (when checked) or never checked. */
  current: number | null;
  checked: boolean;
  /** "Oct 30, 2026": when it was last confirmed outside the top 100. */
  checkedOn: string;
  /** 30-day move, positive = up toward #1. */
  change: number | null;
  volume: number | null;
};

/** How many tracked searches show before "Show all". */
const RANKS_SHOWN = 10;

/** A 30-day move: up green, down red, none a dash. Direction is in words for screen readers. */
function Move({ change }: { change: number | null }) {
  if (!change) return <span className="text-ink-faint">-</span>;
  const up = change > 0;
  return (
    <span className={cx("inline-flex items-center gap-1", up ? "text-ok" : "text-danger")}>
      <svg aria-hidden="true" viewBox="0 0 12 12" className={cx("h-2.5 w-2.5 shrink-0", up ? "" : "rotate-180")}>
        <path d="M6 2.5 10 8.5H2Z" fill="currentColor" />
      </svg>
      <span className="sr-only">{up ? "up" : "down"} </span>
      {Math.abs(change)}
    </span>
  );
}

/** The searches we track and where the site sits for each, best spot first.
 *  The spot is the lead figure (green in the top three); beside it, its
 *  30-day move and how many people search it a month. No rank chip: the
 *  list is already ordered by the spot, so a chip would say it twice. */
export function RankingsList({ rows, at = 0 }: { rows: RankRow[]; at?: number }) {
  const [all, setAll] = useState(false);
  if (!rows.length) return <EmptyState title="No searches tracked yet">Each article&apos;s search shows up here once it&apos;s tracked.</EmptyState>;
  const shown = all ? rows : rows.slice(0, RANKS_SHOWN);
  return (
    <div className="space-y-3">
      <ol className="-mx-3 space-y-1" aria-label="Where you rank on Google">
        {shown.map((r, i) => {
          const state = !r.checked ? "Not checked yet" : r.current == null ? `Outside the top 100 as of ${r.checkedOn}` : null;
          return (
            <li key={r.id} className={cx(arrive(i, at).className, ROW)} style={arrive(i, at).style}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink" title={r.keyword}>
                  {r.keyword}
                </span>
                {state ? <span className="mt-1 block truncate text-[12.5px] text-ink-faint">{state}</span> : null}
                {r.change ? (
                  <span className="mt-1 block text-[12.5px] text-ink-faint sm:hidden">
                    <Move change={r.change} /> in 30 days
                  </span>
                ) : null}
              </span>
              <span className="hidden w-20 shrink-0 text-center sm:block">
                <span className="block text-[1.125rem] font-semibold leading-7 tabular-nums">
                  <Move change={r.change} />
                </span>
                <span className={LABEL}>30 days</span>
              </span>
              <Side value={r.volume == null ? "-" : compact(r.volume)} label="Searches/mo" width="w-28" icon={searchIcon} />
              <Lead
                value={r.current == null ? "-" : `#${r.current}`}
                label="On Google"
                strong={r.current != null && r.current <= 10}
                tone={r.current == null ? "text-ink-faint" : r.current <= 3 ? "text-ok" : undefined}
                folded={r.volume != null ? `${compact(r.volume)}/mo` : undefined}
              />
              <OutArrow show={false} />
            </li>
          );
        })}
      </ol>
      {rows.length > RANKS_SHOWN ? (
        <FoldButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${rows.length} searches`}</FoldButton>
      ) : null}
    </div>
  );
}
