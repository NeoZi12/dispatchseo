import { PageLoading } from "@/components/page-loading";
import { Line } from "@/components/ui/skeleton";
import { cx } from "@/components/ui/styles";
import { OwnerShell, type OwnerSection } from "./shell";

// Ghosts of the /owner pages, one per section, at the real widths and
// spacing so the content lands on top without a jump. The shell is the real
// one in ghost mode (its title, sentence and tabs never depend on data); only
// what the data decides is a placeholder. Used by every owner loading.tsx.

/** A panel's hairline frame. */
function Ghost({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cx("overflow-hidden rounded-2xl border border-line-soft bg-surface", className)}>
      {children}
    </div>
  );
}

/** SectionHead: a 16px title, a 13px sentence, a note on the right. */
function Head({ wide = "w-32", note = true }: { wide?: string; note?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-line-soft px-5 py-4 sm:px-6">
      <div>
        <Line className="h-[18px] w-24" style={{ width: undefined }} />
        <Line className={cx("mt-2 h-3.5", wide === "w-32" ? "w-72 max-w-full" : wide)} />
      </div>
      {note ? <Line className="h-3.5 w-28" /> : null}
    </div>
  );
}

/** The metric tabs over a chart (MetricChart): label, big figure, a chart below. */
function Metrics({ n = 3, height = 280 }: { n?: 2 | 3 | 4; height?: number }) {
  return (
    <>
      <div className={cx("grid gap-px border-b border-line-soft bg-line-soft", n === 4 ? "grid-cols-2 lg:grid-cols-4" : n === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {Array.from({ length: n }, (_, i) => (
          <div key={i} className="bg-surface px-5 py-4 sm:px-6 sm:py-5">
            <Line className="h-3.5 w-20" />
            <Line className="mt-3 h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="px-4 pb-5 pt-8 sm:px-6">
        <Line className="w-full rounded-xl" style={{ height }} />
      </div>
    </>
  );
}

/** A BarList: seven label-bar-figure rows. */
function Bars({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-x-4">
          <Line className={cx("h-4", i % 3 === 0 ? "w-28" : i % 3 === 1 ? "w-20" : "w-36")} />
          <Line className="h-2 rounded-full" style={{ width: `${Math.max(8, 100 - i * 13)}%` }} />
          <Line className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

function Detail({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 pb-6 pt-5 sm:px-6">
      <Line className="h-4 w-32" />
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** StatCells: three or four figures split by hairlines. */
function Cells({ n = 3, className = "" }: { n?: 3 | 4; className?: string }) {
  return (
    <div className={cx("grid border-y border-line-soft", n === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3", className)}>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className={cx("px-4 py-3.5 sm:px-6", i > 0 && "border-l border-line-soft")}>
          <Line className="h-3.5 w-20" />
          <Line className="mt-2 h-5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** A table: a header line, then rows of a name over a faint line and a few figures. */
function Rows({ rows = 6, cols = 4, first = "w-48" }: { rows?: number; cols?: number; first?: string }) {
  return (
    <div>
      <div className="flex items-center gap-6 px-5 pb-3 pt-4 sm:px-6">
        <Line className="h-3 w-20" />
        <span className="flex-1" />
        {Array.from({ length: cols - 1 }, (_, i) => (
          <Line key={i} className={cx("h-3 w-14", i > 1 && "hidden lg:block")} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-6 border-t border-line-soft px-5 py-3.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <Line className={cx("h-4", i % 2 ? "w-40" : first)} />
            <Line className="mt-1.5 h-3 w-28" />
          </div>
          {Array.from({ length: cols - 1 }, (_, c) => (
            <Line key={c} className={cx("h-4 w-14", c > 1 && "hidden lg:block")} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Frame({ section, label, children }: { section: OwnerSection; label: string; children: React.ReactNode }) {
  return (
    <PageLoading label={label}>
      <OwnerShell section={section} range={null} now={Date.now()}>
        {children}
      </OwnerShell>
    </PageLoading>
  );
}

/** Home: the visitors panel - three metric tabs over a chart, four details
 *  in a grid, the pages row, then the visit table. */
export function VisitorsGhost() {
  return (
    <Frame section="home" label="Loading the visitors">
      <Ghost>
        <Head />
        <Metrics n={3} height={280} />
        <div className="grid gap-px border-t border-line-soft bg-line-soft md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Detail key={i}>
              <Bars rows={i === 2 ? 3 : 7} />
            </Detail>
          ))}
          <div className="md:col-span-2">
            <Detail>
              <Bars rows={7} />
            </Detail>
          </div>
        </div>
        <div className="border-t border-line-soft">
          <div className="flex items-baseline justify-between px-5 pb-1 pt-5 sm:px-6">
            <Line className="h-4 w-24" />
            <Line className="h-3.5 w-48" />
          </div>
          <Rows rows={8} cols={5} first="w-56" />
        </div>
      </Ghost>
    </Frame>
  );
}

/** Customers: the head, four figures, the table. */
export function CustomersGhost() {
  return (
    <Frame section="customers" label="Loading the customers">
      <Ghost>
        <Head wide="w-96 max-w-full" />
        <Cells n={4} className="border-t-0" />
        <Rows rows={7} cols={6} />
      </Ghost>
    </Frame>
  );
}

/** Plans: the head, four plan tiles, the grouped table. */
export function PlansGhost() {
  return (
    <Frame section="plans" label="Loading the plans">
      <Ghost>
        <Head wide="w-96 max-w-full" />
        <div className="grid grid-cols-2 gap-px bg-line-soft md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-surface px-4 pb-4 pt-4 sm:px-6 sm:pt-5">
              <div className="flex items-center justify-between">
                <Line className="h-3.5 w-16" />
                <Line className="h-3 w-12" />
              </div>
              <Line className="mt-3 h-8 w-10" />
              <Line className="mt-3 h-3 w-28" />
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line-soft pt-3">
                {[0, 1, 2].map((c) => (
                  <div key={c}>
                    <Line className="h-3 w-10" />
                    <Line className="mt-1.5 h-3.5 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-line-soft">
          <Rows rows={6} cols={6} />
        </div>
      </Ghost>
    </Frame>
  );
}

/** Google and AI visibility share one shape: a head, metric tabs over a chart, two detail columns. */
function InsightsGhost({ section, label }: { section: "google" | "ai"; label: string }) {
  return (
    <Frame section={section} label={label}>
      <Ghost>
        <Head />
        <Metrics n={section === "ai" ? 3 : 2} height={240} />
        <div className="grid gap-px border-t border-line-soft bg-line-soft lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Detail key={i}>
              <Bars rows={6} />
            </Detail>
          ))}
        </div>
      </Ghost>
    </Frame>
  );
}

export function GoogleGhost() {
  return <InsightsGhost section="google" label="Loading Google Search" />;
}

export function AiGhost() {
  return <InsightsGhost section="ai" label="Loading AI visibility" />;
}

/** One customer (customers/[id]): the back link, the header with its
 *  avatar and chips, six figures, the ledger beside the cost bars, Google,
 *  the articles table, plan beside sites, the activity strip. */
export function CustomerGhost() {
  return (
    <PageLoading label="Loading the customer">
      <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
        <Line className="h-3.5 w-24" />
        <div className="flex items-start gap-4 pb-1">
          <Line className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <Line className="h-7 w-72 max-w-full" />
            <div className="mt-3 flex flex-wrap gap-3">
              <Line className="h-5 w-16 rounded-md" />
              <Line className="h-4 w-28" />
              <Line className="h-4 w-56 max-w-full" />
              <Line className="h-4 w-24" />
            </div>
          </div>
        </div>
        <Ghost className="grid grid-cols-2 gap-px bg-line-soft sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-surface px-4 pb-4 pt-4 sm:px-5 sm:pt-5">
              <Line className="h-3.5 w-24" />
              <Line className="mt-3 h-7 w-20" />
              <Line className="mt-3 h-3 w-32 max-w-full" />
            </div>
          ))}
        </Ghost>
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-5">
          <Ghost className="lg:col-span-3">
            <div className="px-5 pt-5 sm:px-6">
              <Line className="h-4 w-64 max-w-full" />
              <Line className="mt-2 h-3.5 w-40" />
            </div>
            <div className="px-4 pb-5 pt-6 sm:px-6">
              <Line className="h-[200px] w-full rounded-xl" />
            </div>
          </Ghost>
          <Ghost className="lg:col-span-2">
            <div className="px-5 pt-5 sm:px-6">
              <Line className="h-4 w-40" />
            </div>
            <div className="px-5 pb-6 pt-5 sm:px-6">
              <Bars rows={6} />
            </div>
            <Cells n={3} className="border-b-0" />
          </Ghost>
        </div>
        <Ghost>
          <div className="px-5 pt-5 sm:px-6">
            <Line className="h-4 w-56" />
            <Line className="mt-2 h-3.5 w-96 max-w-full" />
          </div>
          <div className="mt-4 border-t border-line-soft">
            <Metrics n={2} height={220} />
          </div>
          <Cells n={3} className="border-b-0" />
        </Ghost>
        <Ghost>
          <div className="px-5 pt-5 sm:px-6">
            <Line className="h-4 w-24" />
            <Line className="mt-2 h-3.5 w-[32rem] max-w-full" />
          </div>
          <div className="mt-4">
            <Rows rows={6} cols={5} first="w-72 max-w-full" />
          </div>
        </Ghost>
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          {[0, 1].map((i) => (
            <Ghost key={i}>
              <div className="px-5 pt-5 sm:px-6">
                <Line className="h-4 w-40" />
              </div>
              <div className="mt-2 divide-y divide-line-soft px-5 sm:px-6">
                {[0, 1, 2, 3].map((r) => (
                  <div key={r} className="flex items-center justify-between py-3">
                    <Line className="h-3.5 w-24" />
                    <Line className="h-3.5 w-32" />
                  </div>
                ))}
              </div>
            </Ghost>
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
