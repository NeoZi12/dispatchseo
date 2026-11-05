import { PageLoading } from "@/components/page-loading";
import { ArticlePageSkeleton } from "@/components/ui/skeleton";

// A ghost of one article's page (ui/skeleton.tsx): one header card (details and button beside the page in a browser frame), the angle, stats, chart, searches beside a details card, the fact check.
export default function Loading() {
  return (
    <PageLoading label="Loading the article">
      <ArticlePageSkeleton />
    </PageLoading>
  );
}
