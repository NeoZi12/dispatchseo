import { PageLoading } from "@/components/page-loading";
import { SettingsPageSkeleton } from "@/components/ui/skeleton";

// A ghost of hosted Settings (ui/skeleton.tsx): the section list and a card of rows. Shared with agent mode; hosted shape.
export default function Loading() {
  return (
    <PageLoading label="Loading settings">
      <SettingsPageSkeleton />
    </PageLoading>
  );
}
