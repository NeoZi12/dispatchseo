import { PageLoading } from "@/components/page-loading";
import { Circle, GhostCard, Line } from "@/components/ui/skeleton";

// A ghost of the Queue page at its real sizes: heading with its link, the
// week strip's seven cells, then "Up next" and a few idea cards (rank, title
// and chips, date tile). The first card carries the accent edge ("Next up").
export default function Loading() {
  return (
    <PageLoading label="Loading the queue">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <Line className="h-8 w-28" />
            <Line className="mt-3 h-4 w-[26rem] max-w-full" />
          </div>
          <Line className="h-4 w-16 shrink-0" />
        </div>
        <GhostCard className="px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1.5">
            <Line className="h-4 w-20" />
            <Line className="h-4 w-44" />
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5 sm:mt-5 sm:gap-2.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i}>
                <Line className="mb-2 h-3 w-8" />
                <Line className="h-11 w-full rounded-lg sm:h-14" />
              </div>
            ))}
          </div>
        </GhostCard>
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
            <div>
              <Line className="h-6 w-24" />
              <Line className="mt-2.5 h-4 w-64 max-w-full" />
            </div>
            <Line className="h-4 w-14" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <GhostCard
                key={i}
                className={`grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-xl px-3 py-3.5 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-4 sm:py-4 ${i === 0 ? "border-accent/45" : ""}`}
              >
                <div className="row-span-2 flex items-center justify-center sm:row-span-1 sm:self-center">
                  <Line className="h-5 w-3.5" />
                </div>
                <div className="min-w-0 self-center">
                  {i === 0 ? (
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <Circle className="h-3.5 w-3.5" />
                      <Line className="h-3 w-14" />
                    </div>
                  ) : null}
                  <Line className={i % 2 ? "h-5 w-2/3" : "h-5 w-4/5"} />
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                    <Line className="h-[1.625rem] w-32 rounded-md" />
                    <Line className="h-4 w-32" />
                    <Line className="h-4 w-20" />
                  </div>
                </div>
                <div className="col-start-2 flex items-center sm:col-start-3 sm:row-start-1 sm:justify-center">
                  <Line className="h-[3.0625rem] w-[5.75rem] rounded-lg" />
                </div>
              </GhostCard>
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
