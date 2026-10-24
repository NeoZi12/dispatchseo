"use client";

// A client component on purpose, though it has no state: a server-rendered
// ghost is sent twice (as HTML and again as a tree in the RSC payload),
// while a client one travels as HTML plus a reference. Page ghosts are
// hundreds of placeholders, so that halves their weight.
import { cx } from "./styles";

// Skeletons: a ghost of each hosted page at the real widths, heights and
// spacing, so the content replaces it without a jump (owner, 2026-10-24:
// "match the exact page"). Primitives first, then one ghost per page and
// per streamed section; loading.tsx files and Suspense fallbacks use the
// same ghosts, so a route loading and a section streaming look alike.
// Shimmer is the subtle Tailwind pulse, off under reduced motion.

/** A placeholder block (kept for older callers). */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={cx("rounded-md bg-surface-2 motion-safe:animate-pulse", className)} />;
}

/** A line of text: give it the text's height and a width. */
// `.sk` (globals.css): a short class rather than the utilities spelled out,
// because a page ghost is hundreds of these and every one is sent twice (the
// HTML and the RSC payload).
export function Line({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <span aria-hidden="true" style={style} className={cx("sk", className)} />;
}

export const Block = Line;

export function Circle({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={cx("sk shrink-0 rounded-full", className)} />;
}

/** The card surface the real pages use (rounded-2xl, hairline, surface). */
export function GhostCard({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <div aria-hidden="true" className={cx("sk-card", className)}>{children}</div>;
}

function Heading({ desc = 1, wide = false }: { desc?: 0 | 1 | 2; wide?: boolean }) {
  return (
    <div>
      <Line className="h-8 w-40" />
      {desc >= 1 ? <Line className={cx("mt-3 h-4", wide ? "w-[32rem] max-w-full" : "w-80 max-w-full")} /> : null}
      {desc >= 2 ? <Line className="mt-2 h-4 w-64 max-w-full" /> : null}
    </div>
  );
}

function SectionTitle({ wide = "w-48" }: { wide?: string }) {
  return (
    <div>
      <Line className={cx("h-6", wide)} />
      <Line className="mt-2 h-4 w-72 max-w-full" />
    </div>
  );
}

/* ------------------------------------------------------------ sections */

/** The overview card (Home, Analytics): head + range chips, tall chart,
 *  two halves. Same paddings as overview-chart.tsx. */
export function OverviewCardSkeleton() {
  return (
    <GhostCard className="overflow-hidden">
      <div className="px-5 pt-6 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <Line className="h-4 w-36" />
            <Line className="mt-2 h-11 w-36 sm:h-[3.25rem]" />
            <Line className="mt-3 h-3 w-44" />
          </div>
          <Line className="h-9 w-[19rem] max-w-full rounded-lg" />
        </div>
        <Line className="mt-7 h-56 w-full rounded-xl opacity-60 sm:h-64" />
        <Line className="mt-2 h-4 w-full opacity-40" />
      </div>
      <div className="mt-8 grid border-t border-line-soft sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className={cx("px-5 py-6 sm:px-8", i === 0 ? "sm:border-r sm:border-line-soft" : "border-t border-line-soft sm:border-t-0")}>
            <Line className="h-4 w-44" />
            <Line className="mt-2 h-8 w-24" />
            <Line className="mt-3 h-3 w-40" />
            <Line className="mt-5 h-24 w-full rounded-lg opacity-60" />
            <Line className="mt-2 h-4 w-full opacity-40" />
          </div>
        ))}
      </div>
    </GhostCard>
  );
}

/** Article list rows (Home's 8, Articles' list): status, title, date, clicks. */
export function ArticleRowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <GhostCard className="overflow-hidden rounded-xl">
      <div className="hidden gap-4 border-b border-line-soft px-5 py-2.5 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)_5rem_5.5rem_1rem]">
        <Line className="h-3 w-12" />
        <Line className="h-3 w-14" />
        <Line className="ml-auto h-3 w-8" />
        <Line className="ml-auto h-3 w-10" />
        <span />
      </div>
      <div className="divide-y divide-line-soft">
        {Array.from({ length: Math.max(rows, 1) }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 px-4 py-4 sm:grid sm:grid-cols-[10rem_minmax(0,1fr)_5rem_5.5rem_1rem] sm:items-center sm:gap-4 sm:px-5">
            <Line className="h-4 w-20 sm:order-1" />
            <Line className={cx("h-4 sm:order-2", i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-2/3" : "w-4/5")} />
            <Line className="hidden h-4 w-12 sm:order-3 sm:ml-auto sm:block" />
            <Line className="hidden h-4 w-14 sm:order-4 sm:ml-auto sm:block" />
            <span className="hidden sm:order-5 sm:block" />
          </div>
        ))}
      </div>
    </GhostCard>
  );
}

/** The sort chips row above a list. */
function SortSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Line className="h-4 w-8" />
      <Line className="h-9 w-72 max-w-full rounded-lg" />
    </div>
  );
}

/** "This month": heading + counts, the weekday row and five weeks. */
export function MonthSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <Line className="h-7 w-52" />
          <Line className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex gap-5">
          <Line className="h-4 w-14" />
          <Line className="h-4 w-28" />
        </div>
      </div>
      <div className="hidden lg:block">
        <div className="grid grid-cols-7 gap-2 px-2 pb-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Line key={i} className="mx-2 h-3 w-8" />
          ))}
        </div>
        <div className="divide-y divide-line-soft border-y border-line-soft">
          {/* One striped placeholder per week for the seven day numbers,
              plus a card ghost on a couple of days - not 35 cells. */}
          {Array.from({ length: 5 }, (_, w) => (
            <div key={w} className="relative min-h-36 px-1.5 py-2">
              <span className="sk-week" />
              <div className="mt-2 grid grid-cols-7 gap-2 px-1">
                {[w % 7, (w * 3 + 4) % 7].map((d, k) => (
                  <Line key={k} className="h-14 rounded-lg opacity-60" style={{ gridColumnStart: d + 1 } as React.CSSProperties} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 lg:hidden">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-3 px-1 py-3">
            <Line className="h-4 w-16" />
            <Line className="h-16 flex-1 rounded-lg opacity-60" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A plain table: header + rows. */
export function TableSkeleton({ rows = 10, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <GhostCard className="overflow-hidden rounded-xl">
      <div className="flex gap-6 border-b border-line-soft px-4 py-3">
        <Line className="h-3 w-20" />
        <span className="flex-1" />
        {Array.from({ length: cols - 1 }, (_, i) => (
          <Line key={i} className={cx("h-3 w-12", i > 0 ? "hidden sm:block" : "")} />
        ))}
      </div>
      <div className="divide-y divide-line-soft">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3">
            <Line className={cx("h-4", i % 2 ? "w-1/2" : "w-2/3")} />
            <span className="flex-1" />
            {Array.from({ length: cols - 1 }, (_, c) => (
              <Line key={c} className={cx("h-4 w-10", c > 0 ? "hidden sm:block" : "")} />
            ))}
          </div>
        ))}
      </div>
    </GhostCard>
  );
}

/* ------------------------------------------------------------ pages */

/** Overview (Home). */
export function OverviewPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-6 lg:gap-x-12">
        <div className="col-span-2 flex items-center gap-3 sm:col-span-1 sm:col-start-1 sm:row-start-1">
          <Line className="h-8 w-8 rounded-lg" />
          <Line className="h-8 w-48" />
        </div>
        <div className="col-start-1 row-start-2 -mt-3 flex flex-wrap items-center gap-3.5">
          <Line className="h-4 w-28" />
          <Line className="h-5 w-24 rounded-md" />
          <Line className="h-4 w-28" />
        </div>
        <div className="col-start-2 row-start-2 flex flex-col items-center gap-2 justify-self-end sm:row-span-3 sm:row-start-1 sm:self-end">
          <Line className="h-14 w-[132px] rounded-lg opacity-60" />
          <Line className="h-8 w-[120px] rounded-lg" />
        </div>
        <div className="col-span-2 row-start-3 sm:col-span-1 sm:col-start-1">
          <Line className="mb-3 h-3 w-64" />
          <div className="grid grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <div className="flex h-4 items-center">
                  <Circle className="h-2.5 w-2.5" />
                  <span className="mx-2 h-0.5 flex-1 rounded-full bg-surface-2" />
                </div>
                <Line className="mt-2.5 h-4 w-20" />
                <Line className="mt-1 h-3 w-14" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <OverviewCardSkeleton />
      <MonthSkeleton />
      <div className="space-y-4">
        <SectionTitle wide="w-24" />
        <SortSkeleton />
        <ArticleRowsSkeleton rows={8} />
      </div>
      <UpNextSkeleton />
    </div>
  );
}

export function UpNextSkeleton() {
  return (
    <div className="grid gap-8 border-t border-line pt-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <SectionTitle wide="w-24" />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <Line key={i} className={cx("h-4", i === 1 ? "w-3/4" : "w-4/5")} />
          ))}
        </div>
      </div>
      <div>
        <Line className="h-4 w-28" />
        <div className="mt-2.5 flex gap-2">
          <Line className="h-10 flex-1 rounded-lg" />
          <Line className="h-10 w-24 rounded-lg" />
        </div>
        <Line className="mt-2 h-3 w-80 max-w-full" />
      </div>
    </div>
  );
}

/** Articles. */
export function ArticlesPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Heading desc={2} wide />
      <div className="flex gap-1 border-b border-line pb-3">
        {[14, 10, 24, 28, 18].map((w, i) => (
          <Line key={i} className="mx-3 h-4" style={{ width: `${w * 4}px` } as React.CSSProperties} />
        ))}
      </div>
      <SortSkeleton />
      <ArticleRowsSkeleton rows={9} />
    </div>
  );
}

/** One article. */
export function ArticlePageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-12">
      <Line className="h-4 w-24" />
      <div className="-mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-12">
        <div>
          <Line className="h-4 w-24" />
          <Line className="mt-3 h-9 w-full max-w-2xl sm:h-11" />
          <Line className="mt-2 h-9 w-2/3 sm:h-11" />
          <Line className="mt-4 h-4 w-72 max-w-full" />
          <Line className="mt-2 h-4 w-48" />
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <Line className="h-11 w-52 rounded-lg" />
          <Line className="h-4 w-32" />
        </div>
      </div>
      <OverviewCardSkeleton />
      <div className="space-y-5">
        <Line className="h-7 w-48" />
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem]">
          <GhostCard className="space-y-5 p-5 sm:p-6">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <Line className="h-3 w-24" />
                <Line className="mt-2 h-4 w-full" />
                <Line className="mt-1.5 h-4 w-2/3" />
              </div>
            ))}
          </GhostCard>
          <GhostCard className="flex flex-col items-center justify-center p-6">
            <Circle className="h-32 w-32" />
            <Line className="mt-3 h-4 w-24" />
          </GhostCard>
        </div>
        <GhostCard>
          <Line className="mx-5 my-3.5 h-4 w-32 sm:mx-6" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3.5 border-t border-line-soft px-5 py-3.5 sm:px-6">
              <Line className="h-[18px] w-[18px] rounded-sm" />
              <Line className="h-4 w-1/2" />
            </div>
          ))}
        </GhostCard>
      </div>
      <div className="space-y-5">
        <Line className="h-7 w-28" />
        <GhostCard className="px-5 py-5 sm:px-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex gap-4 pb-5 last:pb-0">
              <Circle className="mt-1.5 h-3 w-3" />
              <div>
                <Line className="h-4 w-32" />
                <Line className="mt-1.5 h-3 w-24" />
              </div>
            </div>
          ))}
        </GhostCard>
      </div>
    </div>
  );
}

/** Analytics. */
export function AnalyticsPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-14">
      <Heading />
      <OverviewCardSkeleton />
      <div className="grid max-w-xl grid-cols-2 gap-x-8 border-t border-line pt-5">
        {[0, 1].map((i) => (
          <div key={i}>
            <Line className="h-4 w-40" />
            <Line className="mt-2 h-7 w-20" />
            <Line className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      {[12, 8, 8].map((rows, i) => (
        <div key={i} className="space-y-4">
          <SectionTitle />
          <TableSkeleton rows={rows} cols={i === 0 ? 4 : 3} />
        </div>
      ))}
    </div>
  );
}

/** Tools. */
export function ToolsPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <Heading />
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <GhostCard key={i} className="p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Line className="h-9 w-9 rounded-lg" />
              <div className="flex-1">
                <Line className="h-5 w-3/4" />
                <Line className="mt-1.5 h-3 w-1/2" />
              </div>
            </div>
            <Line className="mt-4 h-3 w-36" />
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-4">
              {[0, 1, 2].map((c) => (
                <div key={c}>
                  <Line className="h-3 w-12" />
                  <Line className="mt-1.5 h-6 w-14" />
                </div>
              ))}
            </div>
            <Line className="mt-5 h-10 w-full opacity-50" />
            <Line className="mt-5 h-8 w-32 rounded-lg" />
          </GhostCard>
        ))}
      </div>
    </div>
  );
}

/** Settings: the sub-nav and a section of rows. */
export function SettingsPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <Line className="h-8 w-32" />
      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-10">
        <div className="flex flex-wrap gap-1.5 md:flex-col md:gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Line key={i} className="h-9 w-24 rounded-lg md:w-full" />
          ))}
        </div>
        <div className="space-y-5">
          <SectionTitle wide="w-24" />
          <div className="divide-y divide-line-soft rounded-xl border border-line-soft bg-surface">
            {[false, false, true, true].map((full, i) => (
              <div key={i} className={cx("px-5 py-4", full ? "space-y-3" : "flex items-center justify-between gap-6")}>
                <div>
                  <Line className="h-4 w-32" />
                  <Line className="mt-1.5 h-3 w-56 max-w-full" />
                </div>
                {full ? <Line className="h-20 w-full rounded-lg" /> : <Line className="h-5 w-32" />}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Billing: the plan card and three plans. */
export function BillingPageSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <Line className="h-8 w-28" />
      <div className="space-y-4">
        <Line className="h-6 w-28" />
        <GhostCard className="p-6 sm:p-7">
          <div className="flex items-baseline gap-4">
            <Line className="h-8 w-32" />
            <Line className="h-4 w-16" />
          </div>
          <Line className="mt-3 h-4 w-64" />
          <Line className="mt-2 h-4 w-48" />
          <div className="mt-6 flex gap-3">
            <Line className="h-9 w-32 rounded-lg" />
            <Line className="h-9 w-28 rounded-lg" />
          </div>
        </GhostCard>
      </div>
      <div className="space-y-4">
        <Line className="h-6 w-36" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <GhostCard key={i} className="rounded-xl p-5">
              <Line className="h-5 w-20" />
              <Line className="mt-2 h-8 w-24" />
              <Line className="mt-4 h-4 w-32" />
              <Line className="mt-1.5 h-3 w-28" />
              <Line className="mt-6 h-9 w-full rounded-lg" />
            </GhostCard>
          ))}
        </div>
      </div>
    </div>
  );
}
