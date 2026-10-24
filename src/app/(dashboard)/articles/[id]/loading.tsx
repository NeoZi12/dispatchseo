import { PageLoading } from "@/components/page-loading";
import { ArticlePageSkeleton } from "@/components/ui/skeleton";

// A ghost of one article's page (ui/skeleton.tsx): header and button, numbers card, how it was made, timeline.
export default function Loading() {
  return (
    <PageLoading label="Loading the article">
      <ArticlePageSkeleton />
    </PageLoading>
  );
}
