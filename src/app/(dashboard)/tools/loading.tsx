import { PageLoading } from "@/components/page-loading";
import { ToolsPageSkeleton } from "@/components/ui/skeleton";

// A ghost of hosted Tools (ui/skeleton.tsx). Shared with agent mode's /tools; it wears the hosted shape.
export default function Loading() {
  return (
    <PageLoading label="Loading tools">
      <ToolsPageSkeleton />
    </PageLoading>
  );
}
