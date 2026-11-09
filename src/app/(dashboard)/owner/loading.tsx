import { PageLoading } from "@/components/page-loading";
import { GhostCard, Line, TableSkeleton } from "@/components/ui/skeleton";

// A ghost of an /owner page while its reports load: the heading, the tab
// row, one card with a table. Without it the whole page held back until the
// slowest read answered, and the click looked dead for a second.
export default function Loading() {
  return (
    <PageLoading label="Loading owner analytics">
      <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
        <div className="space-y-3 pb-1">
          <Line className="h-7 w-48" />
          <Line className="h-3.5 w-80 max-w-full" />
        </div>
        <div className="flex gap-6 border-b border-line-soft pb-3">
          {[16, 20, 12, 14, 20].map((w, i) => (
            <Line key={i} className="h-3.5" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <GhostCard>
          <TableSkeleton rows={8} cols={5} />
        </GhostCard>
      </div>
    </PageLoading>
  );
}
