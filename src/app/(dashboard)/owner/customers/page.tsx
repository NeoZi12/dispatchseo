import { isCloudMode } from "@/lib/cloud";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCustomers, ownerGate } from "../data";
import { OwnerShell } from "../shell";
import { CustomersPanel } from "../view";

export const dynamic = "force-dynamic";

export default async function OwnerCustomersPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const c = await loadCustomers(range, now);
  return (
    <OwnerShell section="customers" range={range} now={now}>
      {c.value ? (
        <CustomersPanel c={c.value} range={range} now={now} />
      ) : isCloudMode() ? (
        <EmptyState title="Customers could not be read">{c.error ?? "unknown error"}</EmptyState>
      ) : (
        <EmptyState title="Cloud only">Customer accounts and plans exist in the hosted product; a self-host install has one owner and no billing.</EmptyState>
      )}
    </OwnerShell>
  );
}
