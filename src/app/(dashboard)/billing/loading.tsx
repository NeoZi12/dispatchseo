import { PageLoading } from "@/components/page-loading";
import { BillingPageSkeleton } from "@/components/ui/skeleton";

// A ghost of Billing (ui/skeleton.tsx): the plan card, then the three plans.
export default function Loading() {
  return (
    <PageLoading label="Loading billing">
      <BillingPageSkeleton />
    </PageLoading>
  );
}
