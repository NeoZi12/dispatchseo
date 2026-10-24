import { PageLoading } from "@/components/page-loading";
import { OverviewPageSkeleton } from "@/components/ui/skeleton";

// A ghost of the hosted Overview at its real sizes (ui/skeleton.tsx), so the page lands without a jump. The route is shared with agent mode, which can't be told apart here without a read, so it wears the hosted shape - the product now.
export default function Loading() {
  return (
    <PageLoading label="Loading the overview">
      <OverviewPageSkeleton />
    </PageLoading>
  );
}
