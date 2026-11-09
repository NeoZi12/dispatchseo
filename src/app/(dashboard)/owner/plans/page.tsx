import { isCloudMode } from "@/lib/cloud";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCustomers, ownerGate } from "../data";
import { OwnerShell } from "../shell";
import { PlansPanel } from "../view";

export const dynamic = "force-dynamic";

export default async function OwnerPlansPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const c = await loadCustomers(range, now);
  return (
    <OwnerShell section="plans" range={range} now={now}>
      {c.value ? (
        <PlansPanel c={c.value} range={range} now={now} />
      ) : isCloudMode() ? (
        <EmptyState title="Plans could not be read">{c.error ?? "unknown error"}</EmptyState>
      ) : (
        <EmptyState title="Cloud only">Plans exist in the hosted product; a self-host install has one owner and no billing.</EmptyState>
      )}
    </OwnerShell>
  );
}
