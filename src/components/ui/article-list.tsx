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
// same. Five columns a row - status, title, date, impressions, clicks - and the whole row
// is a link to the article's own page (preview, numbers, the live link and
// whatever action applies).

const GRID = "sm:grid-cols-[10rem_minmax(0,1fr)_5rem_6rem_5.5rem_1rem]";

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
}: {
  articles: ArticleRow[];
  glances: Record<string, ArticleGlance>;
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
          className={`hidden gap-4 border-b border-line-soft bg-canvas/30 px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:grid ${GRID}`}
        >
          <span>Status</span>
          <span>Article</span>
          <span className="text-right">Date</span>
          <span className="text-right">Impressions</span>
          <span className="text-right">Clicks</span>
          <span />
        </div>
        <ul className="divide-y divide-line-soft">
          {shown.map((a, i) => (
            // The first ten rise in order; the rest are simply there.
            <li key={a.draftId || a.runId || a.createdAt} className={i < 10 ? "arrive-up" : undefined} style={i < 10 ? css({ "--at": `${at}ms`, "--i": i, "--step": "40ms" }) : undefined}>
              <Row a={a} glance={glances[a.draftId || a.runId || a.createdAt]} />
            </li>
          ))}
        </ul>
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

function Row({ a, glance }: { a: ArticleRow; glance: ArticleGlance | undefined }) {
  const s = ARTICLE_STATUS[a.status];
  const live = a.status === "published";
  // The whole row opens the article's own page: preview, numbers, the
  // live link and whatever action applies all live there (owner,
  // 2026-11-05: every way to an article goes through its details first).
  const href = articleHref(a);
  const body = (
    <>
      <div className="min-w-0 sm:order-2">
        <p className="al-title transition-colors group-hover:text-accent">{a.title}</p>
        {/* The search it was written for, quiet under the title. */}
        {a.keyword ? (
          <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12.5px] text-ink-faint">
            <SearchIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Written for the search </span>
            <span className="truncate">{a.keyword}</span>
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-4 sm:contents">
        <div className="sm:order-1">
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
        <span className="text-[13px] text-ink-muted tabular-nums sm:order-3 sm:text-right">{shortDate(articleDate(a))}</span>
        {/* Impressions: how often Google showed it, in the top-posts row's
            voice - grey magnifier, muted figure; colour stays on clicks. */}
        {live ? (
          <span className="inline-flex items-center gap-1.5 sm:order-4 sm:justify-end">
            <SearchIcon className="h-4 w-4 shrink-0 text-ink-faint" />
            <span className="text-[16px] font-semibold tracking-tight tabular-nums text-ink-muted">{compact(a.impressions28d)}</span>
            <span className="text-[13px] text-ink-faint sm:sr-only">{a.impressions28d === 1 ? "impression" : "impressions"}</span>
          </span>
        ) : (
          <span className="hidden text-right text-[13px] text-ink-faint sm:order-4 sm:block" aria-hidden="true">
            -
          </span>
        )}
        {/* Clicks: the figure that rewards, icon and number as one
            right-aligned unit so the counts stack down the column. */}
        {live ? (
          <span className="inline-flex items-center gap-1.5 sm:order-5 sm:justify-end">
            <ClickIcon className={cx("h-4 w-4 shrink-0", a.clicks28d > 0 ? "text-ok" : "text-ink-faint")} />
            <span className={cx("text-[16px] font-semibold tracking-tight tabular-nums", a.clicks28d > 0 ? "text-ink" : "text-ink-muted")}>
              {a.clicks28d.toLocaleString("en-US")}
            </span>
            <span className="text-[13px] text-ink-faint sm:sr-only">{a.clicks28d === 1 ? "click" : "clicks"}</span>
          </span>
        ) : (
          <span className="hidden text-right text-[13px] text-ink-faint sm:order-5 sm:block" aria-hidden="true">
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
            className="al-chev transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
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
  return href ? (
    <Link href={href} className={cx("group al-sum", flag)}>
      {body}
    </Link>
  ) : (
    <div className={cx("al-sum cursor-default hover:bg-transparent", flag)}>{body}</div>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}
