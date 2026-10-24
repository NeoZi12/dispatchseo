import { PageLoading } from "@/components/page-loading";
import { GhostCard, Line } from "@/components/ui/skeleton";

// A ghost of the Queue page at its real sizes: heading, the week strip's
// seven cells, then a few cards (rail, title, chips, date tile).
export default function Loading() {
  return (
    <PageLoading label="Loading the queue">
      <div className="mx-auto max-w-4xl space-y-8">
        <div>
          <Line className="h-8 w-32" />
          <Line className="mt-3 h-4 w-[30rem] max-w-full" />
        </div>
        <GhostCard className="px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex items-baseline justify-between gap-6">
            <Line className="h-4 w-20" />
            <Line className="h-4 w-36" />
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5 sm:mt-5 sm:gap-2.5">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i}>
                <Line className="mb-1.5 h-3 w-8" />
                <Line className="h-11 w-full rounded-lg sm:h-14" />
              </div>
            ))}
          </div>
        </GhostCard>
        <div className="space-y-4">
          <div>
            <Line className="h-6 w-24" />
            <Line className="mt-2 h-4 w-80 max-w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }, (_, i) => (
              <GhostCard key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-3 rounded-xl px-3 py-4 sm:grid-cols-[2.75rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-4">
                <Line className="mx-auto h-9 w-9 rounded-lg" />
                <div className="min-w-0">
                  <Line className={i % 2 ? "h-5 w-2/3" : "h-5 w-4/5"} />
                  <div className="mt-3 flex gap-5">
                    <Line className="h-6 w-32 rounded-md" />
                    <Line className="h-5 w-28" />
                    <Line className="h-5 w-24" />
                  </div>
                </div>
                <Line className="col-start-2 mt-3 h-11 w-[5.75rem] rounded-lg sm:col-start-3 sm:row-start-1 sm:mt-0" />
              </GhostCard>
            ))}
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
