"use client";

// Client component for weight: rendered into the HTML on the server as
// always, but the RSC payload carries the articles and their facts (data)
// rather than every row's full markup tree. The server actions it calls
// (publish, retry) pass through as references.
import Link from "next/link";
import { useState } from "react";
import type { AutopilotArticle } from "@/lib/autopilot/report";
import { releaseArticle, retryArticle } from "@/app/autopilot-actions";
import {
  ARTICLE_SORTS,
  ARTICLE_STATUS,
  articleDate,
  articleStep,
  longDate,
  shortDate,
  articleHref,
  statusLabel,
  stepLine,
  type ArticleSort,
} from "@/app/(dashboard)/article-status";
import type { ArticleGlance } from "@/app/(dashboard)/articles/article-data";
import { ActionForm } from "./action-form";
import { buttonClass } from "./button";
import { PipelineSteps } from "./pipeline-steps";
import { StatusPill } from "./status-pill";
import { cx, FOCUS_RING } from "./styles";

// The article list, one component for Home (the latest few) and the
// Articles page (all of them, under status tabs), so the two behave the
// same. Four columns a row - status, title, date, clicks - and the whole row
// opens (native <details>, keyboard and no-JS included) onto a short panel
// of plain facts, one per line, and the one or two buttons that apply.
// Everything deeper (score, claims, angle, timeline) is on the article's
// own page, one click further.

const GRID = "sm:grid-cols-[10rem_minmax(0,1fr)_5rem_5.5rem_1rem]";
const css = (v: Record<string, string | number>) => v as React.CSSProperties;


/** "Sort: Newest | Most clicks | Best on Google" - links, so it works
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
  slug,
  paused,
  at = 0,
}: {
  articles: AutopilotArticle[];
  glances: Record<string, ArticleGlance>;
  slug: string;
  paused: boolean;
  /** Arrival delay (ms) of the first row; the rest follow 40ms apart. */
  at?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-line-soft bg-surface">
      <div aria-hidden="true" className={`hidden gap-4 border-b border-line-soft px-5 py-2.5 text-[12px] text-ink-faint sm:grid ${GRID}`}>
        <span>Status</span>
        <span>Article</span>
        <span className="text-right">Date</span>
        <span className="text-right">Clicks</span>
        <span />
      </div>
      <ul className="divide-y divide-line-soft">
        {articles.map((a, i) => (
          // The first ten rise in order; the rest are simply there.
          <li key={a.draftId || a.runId || a.createdAt} className={i < 10 ? "arrive-up" : undefined} style={i < 10 ? css({ "--at": `${at}ms`, "--i": i, "--step": "40ms" }) : undefined}>
            <Row a={a} glance={glances[a.draftId || a.runId || a.createdAt]} slug={slug} paused={paused} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ a, glance, slug, paused }: { a: AutopilotArticle; glance: ArticleGlance | undefined; slug: string; paused: boolean }) {
  const s = ARTICLE_STATUS[a.status];
  const live = a.status === "published";
  // The panel's markup is built the first time the row opens, not for every
  // row up front: most rows are never opened, and each panel is the bulk of
  // a row's HTML. (Its facts are already here - nothing is fetched.)
  const [opened, setOpened] = useState(false);
  return (
    // Waiting on the owner: an amber edge that stays, and three soft passes
    // on first paint so the eye lands here.
    <details
      className={cx("dispatch-details group", s.attention ? "dispatch-flag shadow-[inset_2px_0_0_var(--color-warn)]" : "")}
      onToggle={(e) => e.currentTarget.open && setOpened(true)}
    >
      <summary className="al-sum">
        <div className="min-w-0 sm:order-2">
          <p className="al-title">{a.title}</p>
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
          <span className={cx("text-[13px] tabular-nums sm:order-4 sm:text-right", live ? "text-ink" : "hidden text-ink-faint sm:block")}>
            {live ? (
              <>
                {a.clicks28d.toLocaleString("en-US")} <span className="text-ink-faint">{a.clicks28d === 1 ? "click" : "clicks"}</span>
              </>
            ) : (
              "-"
            )}
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="al-chev"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </summary>
      <div className="dispatch-details-body al-panel">{opened ? <Glance a={a} glance={glance} slug={slug} paused={paused} /> : null}</div>
    </details>
  );
}

/** The expand panel: plain facts, one per line, then the buttons. */
function Glance({ a, glance, slug, paused }: { a: AutopilotArticle; glance: ArticleGlance | undefined; slug: string; paused: boolean }) {
  const live = a.status === "published";
  const href = articleHref(a);
  const sources = glance?.sources ?? [];
  const spot =
    glance?.now != null
      ? `#${Math.max(1, Math.round(glance.now))} now${glance.best ? `, best #${Math.max(1, Math.round(glance.best.position))}` : ""}`
      : live
        ? "Not on Google yet"
        : null;
  // Retry starts a new run, so only a failed RUN can (a draft the quality
  // gate rejected has a finished run), and never while paused.
  const canRetry = a.runStatus === "failed" && a.runId != null && !paused;
  const step = articleStep(a);
  return (
    <div className="space-y-5">
      {step != null ? (
        <div className="max-w-xl">
          <PipelineSteps current={step} labels />
          <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{stepLine(step)}</p>
        </div>
      ) : null}
      <dl className="al-facts">
        <Fact label={live ? "Went live" : "Started"}>{longDate(live ? a.publishedAt : a.createdAt)}</Fact>
        {spot ? <Fact label="Spot on Google">{spot}</Fact> : null}
        {live ? (
          <Fact label="People who clicked">
            {a.clicks28d.toLocaleString("en-US")} in the last 28 days
          </Fact>
        ) : null}
        {a.keyword ? <Fact label="Written for the search">{a.keyword}</Fact> : null}
        {sources.length ? (
          <Fact label="Checked against">
            {sources.length} {sources.length === 1 ? "source" : "sources"}{" "}
            <span className="text-[12.5px] text-ink-faint">
              ({[...new Set(sources.map((s) => s.host))].slice(0, 4).join(", ")}
              {new Set(sources.map((s) => s.host)).size > 4 ? ", ..." : ""})
            </span>
          </Fact>
        ) : null}
        {glance?.gone ? <Fact label="On your site">Gone. The page doesn&apos;t load any more, so it can&apos;t earn new clicks.</Fact> : null}
        {a.status === "failed" ? <Fact label="Why it stopped">{a.error ?? "It couldn't finish with facts it could verify, so nothing was published."}</Fact> : null}
      </dl>
      <div className="flex flex-wrap items-center gap-3">
        {live && a.url && !glance?.gone ? (
          <a href={a.url} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md")}>
            Open the article
            <ExternalIcon />
          </a>
        ) : a.status === "held" && a.runId ? (
          <ActionForm action={releaseArticle} slug={slug} submitLabel="Publish now" hidden={{ run_id: a.runId }} className="[&_p:empty]:hidden" />
        ) : a.status === "needs_setup" ? (
          <Link href="/settings?section=publishing" className={buttonClass("primary", "md")}>
            Choose where articles go
          </Link>
        ) : canRetry ? (
          <ActionForm action={retryArticle} slug={slug} submitLabel="Try again" hidden={{ run_id: a.runId! }} className="[&_p:empty]:hidden" />
        ) : null}
        {href ? (
          <Link href={href} className={buttonClass("secondary", "md")}>
            Full details
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="al-dd">{children}</dd>
    </>
  );
}

export function ExternalIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}
