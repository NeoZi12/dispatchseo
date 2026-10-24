import { PageLoading } from "@/components/page-loading";
import { AnalyticsPageSkeleton } from "@/components/ui/skeleton";

// A ghost of hosted Analytics at its real sizes (ui/skeleton.tsx). Shared with agent mode's /analytics; it wears the hosted shape (no read here to tell them apart).
export default function Loading() {
  return (
    <PageLoading label="Loading analytics">
      <AnalyticsPageSkeleton />
    </PageLoading>
  );
}
