"use client";

// Client component for weight: rendered into the HTML on the server as
// always, but the RSC payload carries the articles and their facts (data)
// rather than every row's full markup tree. The server actions it calls
// (retry) pass through as references.
import Link from "next/link";
import { useState } from "react";
import {
  ARTICLE_SORTS,
  ARTICLE_STATUS,
  articleDate,
  shortDate,
  articleHref,
  statusLabel,
  type ArticleRow,
  type ArticleSort,
} from "@/app/(dashboard)/article-status";
import type { ArticleGlance } from "@/app/(dashboard)/articles/article-data";
import { StatusPill } from "./status-pill";
import { ClickIcon, SearchIcon } from "./icons";
import { cx, FOCUS_RING } from "./styles";

// The article list, one component for Home (the latest few) and the
// Articles page (all of them, under status tabs), so the two behave the
// same. Columns: status, the title with "Published on <date>" under it,
// the keyword's monthly searches ("170/mo") and difficulty (the bare number), impressions, clicks - every figure in its own
// right-aligned column at one size (owner, 2026-11-10: numbers never ride
// as grey text under the title, no "Easy"/"Hard" words, no gauge) - and the whole row is a link
// to the article's own page (preview, numbers, the live link and whatever
// action applies).
//
// The four figure columns are one width and centred, header and value
// alike, so the space between them is the same everywhere (owner,
// 2026-11-10). The grids are utilities on the row and the header, so they beat
// .al-sum's own grid (globals.css, components layer).
const GRID = "sm:grid-cols-[8.5rem_minmax(0,1fr)_repeat(4,6.25rem)_1rem]";
// Home's "Latest articles" lists only live ones, so the status column goes.
const GRID_NO_STATUS = "sm:grid-cols-[minmax(0,1fr)_repeat(4,6.25rem)_1rem]";

const css = (v: Record<string, string | number>) => v as React.CSSProperties;
/** 1,240 -> "1.2K": impressions run into the thousands where clicks
 *  stay small, and the column has to hold its width. */
const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : n.toLocaleString("en-US"));


/** "Sort: Newest | Oldest | Most clicks" - links, so it works
 *  without JavaScript, survives a reload and keeps the other params. */
export function SortChips({
  base,
  sort,
  keep = {},
  anchor,
  className = "",
}: {
  base: string;
  sort: ArticleSort;
  keep?: Record<string, string | undefined>;
  /** Jump back to the list after the reload (Home's list is far down). */
  anchor?: string;
  className?: string;
}) {
  const href = (key: ArticleSort) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) if (v) q.set(k, v);
    if (key !== "newest") q.set("sort", key);
    const qs = q.toString();
    return `${base}${qs ? `?${qs}` : ""}${anchor ? `#${anchor}` : ""}`;
  };
  return (
    <div className={cx("flex flex-wrap items-center gap-2.5", className)}>
      <span className="text-[13px] text-ink-muted">Sort</span>
      <nav aria-label="Sort articles" className="flex flex-wrap rounded-lg bg-canvas/70 p-0.5 ring-1 ring-line-soft">
        {ARTICLE_SORTS.map((s) => (
          <Link
            key={s.key}
            href={href(s.key)}
            scroll={false}
            aria-current={s.key === sort ? "true" : undefined}
            className={cx(
              "rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors",
              s.key === sort ? "bg-surface-3 text-ink shadow-sm shadow-black/30" : "text-ink-faint hover:text-ink",
              FOCUS_RING,
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function ArticleList({
  articles,
  glances,
  at = 0,
  pageSize,
  hideStatus = false,
  more,
}: {
  articles: ArticleRow[];
  glances: Record<string, ArticleGlance>;
  /** Drop the status column (Home's latest articles: all live). */
  hideStatus?: boolean;
  /** A last row inside the card linking to the full list ("See all ..."). */
  more?: { href: string; label: string };
  /** Kept for callers; the row's actions live on the article's page now. */
  slug?: string;
  paused?: boolean;
  /** Arrival delay (ms) of the first row; the rest follow 40ms apart. */
  at?: number;
  /** Show this many rows, then "Show more" adds the next batch. */
  pageSize?: number;
}) {
  const [limit, setLimit] = useState(pageSize ?? articles.length);
  const shown = articles.slice(0, limit);
  const left = articles.length - shown.length;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line-soft bg-surface">
        {/* Column labels in the overview's voice: tiny, tracked, faint. */}
        <div
          aria-hidden="true"
          className={`hidden items-end gap-4 border-b border-line-soft bg-canvas/30 px-5 py-2.5 text-[11px] font-medium uppercase leading-tight tracking-wider text-ink-faint sm:grid ${hideStatus ? GRID_NO_STATUS : GRID}`}
        >
          {hideStatus ? null : <span>Status</span>}
          <span>Article</span>
          <span className="text-center" title="How many people search for the article's keyword on Google each month">
            Keyword volume
          </span>
          <span className="text-center" title="Keyword difficulty: how hard it is to reach Google's first page for the keyword, from 0 (easy) to 100 (very hard)">
            Keyword difficulty
          </span>
          <span className="text-center">Impressions</span>
          <span className="text-center">Clicks</span>
          <span />
        </div>
        <ul className="divide-y divide-line-soft">
          {shown.map((a, i) => (
            // The first ten rise in order; the rest are simply there.
            <li key={a.draftId || a.runId || a.createdAt} className={i < 10 ? "arrive-up" : undefined} style={i < 10 ? css({ "--at": `${at}ms`, "--i": i, "--step": "40ms" }) : undefined}>
              <Row a={a} glance={glances[a.draftId || a.runId || a.createdAt]} hideStatus={hideStatus} />
            </li>
          ))}
        </ul>
        {more ? (
          <Link
            href={more.href}
            className={cx(
              "group flex items-center justify-center gap-2 border-t border-line-soft px-5 py-3.5 text-[14px] font-medium text-accent transition-colors hover:bg-surface-2/50",
              FOCUS_RING,
            )}
          >
            {more.label}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        ) : null}
      </div>
      {left > 0 && pageSize ? (
        <button type="button" onClick={() => setLimit((n) => n + pageSize)} className="btn btn-secondary btn-md w-full">
          Show {Math.min(left, pageSize)} more {Math.min(left, pageSize) === 1 ? "article" : "articles"}
          <span className="font-normal text-ink-faint">({left} left)</span>
        </button>
      ) : null}
    </div>
  );
}

function Row({ a, glance, hideStatus }: { a: ArticleRow; glance: ArticleGlance | undefined; hideStatus: boolean }) {
  const s = ARTICLE_STATUS[a.status];
  const live = a.status === "published";
  // The whole row opens the article's own page: preview, numbers, the
  // live link and whatever action applies all live there (owner,
  // 2026-11-05: every way to an article goes through its details first).
  const href = articleHref(a);
  const body = (
    <>
      <div className="min-w-0 sm:order-2">
        {/* Wraps to two lines from sm too: with the keyword columns the
            title column is narrower than a long title. */}
        <p className="al-title transition-colors group-hover:text-accent sm:whitespace-normal">{a.title}</p>
        {/* When it went live (or, still in the works, when it started). */}
        <p className="mt-1 text-[13px] text-ink-muted">
          {live ? "Published on" : "Started on"} <span className="tabular-nums">{shortDate(articleDate(a))}</span>
        </p>
      </div>
      <div className="flex items-center gap-4 sm:contents">
        <div className={hideStatus ? "hidden" : "sm:order-1"}>
          {/* Known not to load any more: grey "Gone", whatever the
              writer last said. */}
          {glance?.gone ? (
            <StatusPill tone="neutral">Gone</StatusPill>
          ) : (
            <StatusPill tone={s.tone} live={s.live}>
              {statusLabel(a)}
            </StatusPill>
          )}
        </div>
        {/* The keyword's monthly searches and difficulty, as research
            measured them; "-" when it never did. */}
        {glance?.volume == null ? (
          <Dash order="sm:order-3" />
        ) : (
          <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap sm:order-3 sm:justify-center">
            <span className="text-[13px] text-ink-faint sm:sr-only">Keyword volume</span>
            <span className="text-[16px] font-semibold tracking-tight tabular-nums text-ink-muted">
              {compact(glance.volume)}
              <span className="ml-px text-[12px] font-medium tracking-normal text-ink-faint">/mo</span>
            </span>
          </span>
        )}
        {glance?.difficulty == null ? (
          <Dash order="sm:order-4" />
        ) : (
          <Difficulty kd={glance.difficulty} />
        )}
        {/* Impressions: how often Google showed it, in the top-posts row's
            voice - grey magnifier, muted figure; colour stays on clicks. */}
        {live ? (
          <span className="inline-flex items-center gap-1.5 sm:order-5 sm:justify-center">
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <span className="text-[16px] font-semibold tracking-tight tabular-nums text-ink-muted">{compact(a.impressions28d)}</span>
            <span className="text-[13px] text-ink-faint sm:sr-only">{a.impressions28d === 1 ? "impression" : "impressions"}</span>
          </span>
        ) : (
          <span className="hidden text-center text-[13px] text-ink-faint sm:order-5 sm:block" aria-hidden="true">
            -
          </span>
        )}
        {/* Clicks: the figure that rewards, icon and number as one
            right-aligned unit so the counts stack down the column. */}
        {live ? (
          <span className="inline-flex items-center gap-1.5 sm:order-6 sm:justify-center">
            <ClickIcon className={cx("h-4 w-4 shrink-0", a.clicks28d > 0 ? "text-ok" : "text-ink-faint")} />
            <span className={cx("text-[16px] font-semibold tracking-tight tabular-nums", a.clicks28d > 0 ? "text-ink" : "text-ink-muted")}>
              {a.clicks28d.toLocaleString("en-US")}
            </span>
            <span className="text-[13px] text-ink-faint sm:sr-only">{a.clicks28d === 1 ? "click" : "clicks"}</span>
          </span>
        ) : (
          <span className="hidden text-center text-[13px] text-ink-faint sm:order-6 sm:block" aria-hidden="true">
            -
          </span>
        )}
        {href ? (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="al-chev transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none sm:order-7"
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        ) : null}
      </div>
    </>
  );
  // Waiting on the owner: an amber edge that stays, and three soft passes
  // on first paint so the eye lands here.
  const flag = s.attention ? "dispatch-flag shadow-[inset_2px_0_0_var(--color-warn)]" : "";
  const grid = hideStatus ? GRID_NO_STATUS : GRID;
  return href ? (
    <Link href={href} className={cx("group al-sum", grid, flag)}>
      {body}
    </Link>
  ) : (
    <div className={cx("al-sum cursor-default hover:bg-transparent", grid, flag)}>{body}</div>
  );
}

/** An empty figure column: a quiet dash from sm, nothing on a phone. */
function Dash({ order }: { order: string }) {
  return (
    <span className={cx("hidden text-center text-[13px] text-ink-faint sm:block", order)} aria-hidden="true">
      -
    </span>
  );
}

/** Keyword difficulty (0-100): just the number,
 *  centred in its column under a centred header (owner, 2026-11-10: no
 *  gauge, no words). Grey on
 *  purpose: colour stays on clicks. */
function Difficulty({ kd }: { kd: number }) {
  const v = Math.max(0, Math.min(100, Math.round(kd)));
  return (
    <span className="inline-flex items-baseline gap-1.5 sm:order-4 sm:justify-center">
      <span className="text-[13px] text-ink-faint sm:sr-only">Keyword difficulty</span>
      <span className="text-[16px] font-semibold tracking-tight tabular-nums text-ink-muted">
        {v}
        <span className="sr-only"> out of 100</span>
      </span>
    </span>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}
