import { PageLoading } from "@/components/page-loading";
import { ArticlesPageSkeleton } from "@/components/ui/skeleton";

// A ghost of the Articles page at its real sizes (ui/skeleton.tsx): heading, tabs, sort, rows.
export default function Loading() {
  return (
    <PageLoading label="Loading articles">
      <ArticlesPageSkeleton />
    </PageLoading>
  );
}
