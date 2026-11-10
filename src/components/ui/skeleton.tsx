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

/** A line of text at the real line height: the bar is ~70% of the font size,
 *  centred in a box of the line's height, so stacked lines take exactly the
 *  room the real text does (a plain h-4 Line is 16px against 21-23px lines).
 *  Padding rather than margin so neighbours' margins never collapse into it;
 *  the radius is padded to survive the content-box clip. */
function Txt({ size = 14, lh, className = "", style }: { size?: number; lh?: number; className?: string; style?: React.CSSProperties }) {
  const h = lh ?? Math.round(size * 1.5 * 10) / 10;
  const bar = Math.round(size * 0.72);
  const pad = (h - bar) / 2;
  return (
    <span
      aria-hidden="true"
      style={{ height: h, paddingBlock: pad, backgroundClip: "content-box", borderRadius: pad + 3, ...style }}
      className={cx("sk", className)}
    />
  );
}

/** PageHeading: the title, one or two lines of context, an optional link on the right. */
function PageHead({ lines = 1, actions = false }: { lines?: 1 | 2; actions?: boolean }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <Txt size={28} lh={35} className="w-36" />
        <div className="mt-2 max-w-[62ch]">
          <Txt size={14} lh={22.75} className="w-[26rem] max-w-full" />
          {lines >= 2 ? <Txt size={14} lh={22.75} className="w-80 max-w-full" /> : null}
        </div>
      </div>
      {actions ? <Txt size={14} lh={21} className="w-24 shrink-0" /> : null}
    </div>
  );
}

/** CardHeader: a 15px title and its 13px line. */
function CardTitle({ title = "w-40", desc = "w-72", action }: { title?: string; desc?: string | null; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
      <div className="min-w-0 max-w-full flex-1">
        <Txt size={15} className={title} />
        {desc ? <Txt size={13} className={cx("mt-1 max-w-full", desc)} /> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ sections */

/** Ranked rows (Home's top posts; Analytics' pages, searches and rankings):
 *  a rank chip, a name over a faint line, then the three figure columns.
 *  The real rows are ~73px; the columns drop away under 640px as they do. */
function RankedRowsSkeleton({ rows = 5, chip = true, className = "" }: { rows?: number; chip?: boolean; className?: string }) {
  return (
    <div className={cx("-mx-3 space-y-1", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[4.6rem] items-center gap-4 px-3 sm:gap-5">
          {chip ? <Line className="h-9 w-9 shrink-0 rounded-lg" /> : null}
          <div className="min-w-0 flex-1">
            <Txt size={15} className={i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-3/5" : "w-2/3"} />
            <Txt size={12.5} className="mt-1 w-1/3" />
          </div>
          <div className="hidden w-20 shrink-0 sm:block">
            <Txt size={18} lh={28} className="mx-auto w-9" />
            <Txt size={11} className="mx-auto mt-0.5 w-12" />
          </div>
          <div className="hidden w-28 shrink-0 sm:block">
            <Txt size={18} lh={28} className="mx-auto w-14" />
            <Txt size={11} className="mx-auto mt-0.5 w-16" />
          </div>
          <div className="w-24 shrink-0">
            <Txt size={26} lh={28} className="ml-auto w-14" />
            <Txt size={11} className="ml-auto mt-0.5 w-10" />
          </div>
          <Line className="h-4 w-4 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** The overview card (Home, Analytics), as overview-chart.tsx draws it: the
 *  head and range chips, the big chart, then two halves (times seen on
 *  Google with its chart; articles published with its calendar). `posts` is
 *  how many rows "Your top posts" shows under the halves (Home only; 0 for
 *  Analytics, which has no such list). */
export function OverviewCardSkeleton({ posts = 0 }: { posts?: number }) {
  return (
    <GhostCard className="overflow-hidden">
      <div className="px-5 pt-6 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div>
            <Txt size={14} className="w-36" />
            <Line className="mt-2 h-11 w-36 sm:h-[3.25rem]" />
            <Txt size={12.5} className="mt-3 w-52" />
          </div>
          <Line className="h-9 w-[19rem] max-w-full rounded-lg" />
        </div>
        <Line className="mt-7 h-56 w-full rounded-xl opacity-60 sm:h-64" />
        <div className="mt-2 flex h-4 justify-between">
          {Array.from({ length: 6 }, (_, i) => (
            <Line key={i} className="h-2.5 w-10 opacity-50" />
          ))}
        </div>
        <Txt size={12.5} className="mt-4 w-56" />
      </div>
      <div className="mt-8 grid border-t border-line-soft sm:grid-cols-2">
        <div className="px-5 py-6 sm:border-r sm:border-line-soft sm:px-8">
          <Txt size={14} className="w-56" />
          <Line className="mt-2 h-8 w-24" />
          <Txt size={12.5} className="mt-3 w-52" />
          <Line className="mt-5 h-24 w-full rounded-lg opacity-60" />
          <div className="mt-2 flex h-4 justify-between">
            {[0, 1, 2].map((i) => (
              <Line key={i} className="h-2.5 w-10 opacity-50" />
            ))}
          </div>
        </div>
        <div className="border-t border-line-soft px-5 py-6 sm:border-t-0 sm:px-8">
          <Txt size={14} className="w-40" />
          <Line className="mt-2 h-8 w-12" />
          <Txt size={12.5} className="mt-3 w-64 max-w-full" />
          {/* The month calendar: weekday letters, then five weeks of day cells. */}
          <div className="mt-5 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }, (_, i) => (
              <Line key={i} className="mx-auto h-2.5 w-2 opacity-60" />
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {Array.from({ length: 35 }, (_, i) => (
              <Line key={i} className="h-6 rounded-[5px] opacity-60" />
            ))}
          </div>
        </div>
      </div>
      {posts > 0 ? (
        <div className="border-t border-line-soft px-5 py-6 sm:px-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <Txt size={14} className="w-28" />
            <Txt size={12.5} className="w-48" />
          </div>
          <RankedRowsSkeleton rows={posts} className="mt-3" />
        </div>
      ) : null}
    </GhostCard>
  );
}

/** The sort chips row above a list. */
function SortSkeleton() {
  return (
    <div className="flex items-center gap-2.5">
      <Txt size={13} className="w-8" />
      <Line className="h-9 w-72 max-w-full rounded-lg" />
    </div>
  );
}

/** Article list rows (Articles' list): status, title over its search, date,
 *  clicks. Rows are ~77px; on a phone the title sits over a status row. */
export function ArticleRowsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <GhostCard className="overflow-hidden rounded-xl">
      <div className="hidden gap-4 border-b border-line-soft px-5 py-2.5 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_repeat(4,6.25rem)_1rem]">
        <Txt size={11} className="w-12" />
        <Txt size={11} className="w-14" />
        <Txt size={11} className="mx-auto w-11" />
        <Txt size={11} className="mx-auto w-16" />
        <Txt size={11} className="mx-auto w-16" />
        <Txt size={11} className="mx-auto w-10" />
        <span />
      </div>
      <div className="divide-y divide-line-soft">
        {Array.from({ length: Math.max(rows, 1) }, (_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-4 py-4 sm:grid sm:grid-cols-[8.5rem_minmax(0,1fr)_repeat(4,6.25rem)_1rem] sm:items-center sm:gap-4 sm:px-5">
            <div className="min-w-0 sm:order-2">
              <Txt size={15} className={i % 3 === 0 ? "w-3/4" : i % 3 === 1 ? "w-2/3" : "w-4/5"} />
              <Txt size={12.5} className="mt-1 w-1/3" />
            </div>
            <div className="flex items-center gap-4 sm:contents">
              <div className="flex items-center gap-2 sm:order-1">
                <Circle className="h-2 w-2" />
                <Txt size={13} className="w-14" />
              </div>
              <Txt size={16} className="hidden w-14 sm:order-3 sm:mx-auto sm:block" />
              <Txt size={16} className="hidden w-8 sm:order-4 sm:mx-auto sm:block" />
              <Txt size={16} className="w-12 sm:order-5 sm:mx-auto" />
              <Txt size={16} className="w-10 sm:order-6 sm:mx-auto" />
              <Line className="ml-auto h-4 w-4 sm:order-7 sm:ml-0" />
            </div>
          </div>
        ))}
      </div>
    </GhostCard>
  );
}

/** "This month": heading + counts, the weekday row and five weeks. */
export function MonthSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <Txt size={20} lh={28} className="w-52" />
          <Txt size={14} className="mt-1 w-96 max-w-full" />
        </div>
        <div className="flex gap-5">
          <Txt size={14} className="w-16" />
          <Txt size={14} className="w-28" />
        </div>
      </div>
      <div className="hidden lg:block">
        <div className="grid grid-cols-7 gap-2 px-2 pb-2">
          {Array.from({ length: 7 }, (_, i) => (
            <Txt key={i} size={12} className="mx-2 w-8" />
          ))}
        </div>
        <div className="divide-y divide-line-soft border-y border-line-soft">
          {/* One striped placeholder per week for the seven day numbers,
              plus a card ghost on a couple of days - not 35 cells. A real
              week is 144px of cell and 8px of padding above and below. */}
          {Array.from({ length: 5 }, (_, w) => (
            <div key={w} className="relative min-h-40 px-1.5 py-2">
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

/** Overview (Home): the site header, the overview card with its top posts,
 *  this month, up next. */
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
      <OverviewCardSkeleton posts={5} />
      <MonthSkeleton />
      <UpNextSkeleton />
    </div>
  );
}

export function UpNextSkeleton() {
  return (
    <div className="grid gap-8 border-t border-line pt-10 lg:grid-cols-2 lg:gap-14">
      <div>
        <CardTitle title="w-20" desc="w-80" action={<Line className="h-8 w-28 shrink-0 rounded-lg" />} />
        <div className="mt-5 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3.5">
              <Txt size={15} className="w-4 shrink-0" />
              <Txt size={15} className={cx("min-w-0 flex-1", i === 1 ? "max-w-[75%]" : "max-w-[85%]")} />
            </div>
          ))}
        </div>
      </div>
      <div>
        <Txt size={14} className="w-28" />
        <div className="mt-1.5 flex gap-2">
          <Line className="h-10 flex-1 rounded-lg" />
          <Line className="h-10 w-24 rounded-lg" />
        </div>
        <Txt size={13} className="mt-2 w-80 max-w-full" />
      </div>
    </div>
  );
}

/** Articles: heading with its link, status tabs, sort, rows. */
export function ArticlesPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHead lines={2} actions />
      <div className="border-b border-line">
        <div className="flex gap-1">
          {[
            [20, 4],
            [26, 3],
            [66, 3],
            [96, 3],
            [50, 3],
          ].map(([w, c], i) => (
            <div key={i} className="flex h-10 items-center gap-2 px-3">
              <Txt size={14} style={{ width: w }} />
              <Txt size={12} style={{ width: c * 4 }} />
            </div>
          ))}
        </div>
      </div>
      <SortSkeleton />
      <ArticleRowsSkeleton rows={9} />
    </div>
  );
}

/** One article: back link, the header card (details left, the page in a
 *  browser frame right), the angle, how it did on Google (numbers, chart,
 *  searches beside a details card), the folded fact check. */
export function ArticlePageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div className="flex items-center gap-1.5">
        <Line className="h-4 w-4 shrink-0" />
        <Txt size={13} className="w-24" />
      </div>

      <GhostCard className="-mt-4 overflow-hidden rounded-3xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
          <div className="flex items-center gap-2">
            <Circle className="h-2 w-2" />
            <Txt size={14} className="w-16" />
          </div>
          <div className="mt-4">
            {["w-full", "w-5/6", "w-2/3"].map((w, i) => (
              <div key={i} className="flex h-8 items-center sm:h-10">
                <Line className={cx("h-5 sm:h-6", w)} />
              </div>
            ))}
          </div>
          <Txt size={15} className="mt-4 w-72 max-w-full" />
          <Txt size={15} className="mt-1.5 w-56 max-w-full" />
          <Line className="mt-8 h-14 w-60 max-w-full rounded-2xl" />
        </div>
        {/* The page on its stage: browser bar, then a 16:10 screenshot. */}
        <div className="order-first flex items-center bg-surface-2/60 p-5 sm:p-8 lg:order-none lg:p-10">
          <div className="w-full overflow-hidden rounded-xl bg-surface ring-1 ring-line">
            <div className="flex h-9 items-center gap-3 border-b border-line-soft bg-surface-2 px-3.5">
              <span className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <Circle key={i} className="h-2.5 w-2.5 opacity-60" />
                ))}
              </span>
              <Line className="h-5 flex-1 rounded-md opacity-60" />
            </div>
            <Line className="aspect-[16/10] w-full rounded-none opacity-60" />
          </div>
        </div>
      </GhostCard>

      <div className="max-w-3xl border-l-2 border-line pl-4">
        <Txt size={13} className="w-12" />
        <Txt size={15} className="mt-1 w-full" />
      </div>

      <div className="space-y-5">
        <div>
          <Txt size={28} lh={32} className="w-56" />
          <Txt size={15} className="mt-1 w-96 max-w-full" />
        </div>

        <GhostCard className="grid grid-cols-2 gap-px overflow-hidden bg-line-soft lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-w-0 bg-surface px-5 py-5 sm:px-6">
              <Txt size={13} className="w-28" />
              <Line className="mt-1.5 h-[1.9rem] w-16" />
              <Txt size={12.5} className="mt-2 w-3/4" />
            </div>
          ))}
        </GhostCard>

        <GhostCard className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Txt size={15} className="w-64 max-w-full" />
            <Line className="h-9 w-56 rounded-lg" />
          </div>
          <div className="mt-5 flex gap-3">
            <div className="flex h-56 w-9 shrink-0 flex-col justify-between">
              {[0, 1, 2].map((i) => (
                <Txt key={i} size={11.5} lh={14} className="ml-auto w-6 opacity-60" />
              ))}
            </div>
            <div className="min-w-0 flex-1">
              <Line className="h-56 w-full rounded-lg opacity-60" />
              <div className="mt-2 flex h-4 justify-between">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Line key={i} className="h-2.5 w-10 opacity-50" />
                ))}
              </div>
            </div>
          </div>
        </GhostCard>

        {/* Searches beside a details card; stacked under 1024px. The details
            card is kept generic (a header and label/value pairs). */}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <GhostCard>
            <div className="px-5 py-4 sm:px-6">
              <Txt size={15} className="w-48" />
              <Txt size={13} className="mt-0.5 w-80 max-w-full" />
            </div>
            <div className="flex items-center justify-between border-y border-line-soft px-5 py-2 sm:px-6">
              <Txt size={12} className="w-12" />
              <Txt size={12} className="w-32" />
            </div>
            <div className="divide-y divide-line-soft">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-6 px-5 py-2.5 sm:px-6">
                  <Txt size={13.5} className={i % 2 ? "w-2/5" : "w-1/2"} />
                  <Txt size={13.5} className="w-24" />
                </div>
              ))}
            </div>
          </GhostCard>
          <GhostCard>
            <div className="px-5 pt-4 sm:px-6">
              <Txt size={15} className="w-16" />
            </div>
            <div className="mt-2 divide-y divide-line-soft">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-5 py-2.5 sm:px-6">
                  <Txt size={13} className="w-24" />
                  <Txt size={13.5} className="w-28" />
                </div>
              ))}
            </div>
          </GhostCard>
        </div>
      </div>

      <GhostCard className="flex items-center justify-between gap-4 px-5 py-4 sm:px-6">
        <Txt size={15} className="w-44" />
        <Txt size={13} className="w-40" />
      </GhostCard>
    </div>
  );
}

/** Analytics: heading, the overview card, the two quiet stats, then three
 *  ranked lists (pages, searches, rankings) under their headers. */
export function AnalyticsPageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-14">
      <PageHead />
      <OverviewCardSkeleton />
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 border-t border-line pt-5 sm:max-w-xl">
        {[0, 1].map((i) => (
          <div key={i}>
            <Txt size={13} className="w-40 max-w-full" />
            <Line className="mt-1.5 h-7 w-16" />
            <Txt size={12.5} className="mt-2 w-28" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-4">
          <CardTitle title={i === 0 ? "w-36" : i === 1 ? "w-40" : "w-28"} desc="w-80" />
          {i === 0 ? <Txt size={14} className="w-56" /> : null}
          <RankedRowsSkeleton rows={8} chip={i < 2} />
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
