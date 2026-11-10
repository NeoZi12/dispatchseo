import { PageLoading } from "@/components/page-loading";
import { GhostCard, Line } from "@/components/ui/skeleton";
import { ArticleRowsSkeleton } from "@/components/ui/skeleton";

// A ghost of one day / week on Google (period/page.tsx): back link and
// title, the four figures, then the top articles.
export default function Loading() {
  return (
    <PageLoading label="Loading the day">
      <div className="mx-auto max-w-5xl space-y-10">
        <div className="space-y-5">
          <Line className="h-4 w-20" />
          <Line className="h-8 w-72" />
        </div>
        <GhostCard className="h-[132px] rounded-2xl" />
        <div className="space-y-4">
          <Line className="h-6 w-40" />
          <ArticleRowsSkeleton rows={6} />
        </div>
      </div>
    </PageLoading>
  );
}
