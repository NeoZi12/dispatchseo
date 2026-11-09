import { visitorsReport } from "@/lib/owner-visitors";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCustomers, loadTraffic, ownerGate, settle, visitorsError, whoResolver } from "../data";
import { OwnerShell } from "../shell";
import { VisitorsSection } from "../visitors-view";

export const dynamic = "force-dynamic";

export default async function OwnerVisitorsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const [t, v, c] = await Promise.all([loadTraffic(range, now), settle(visitorsReport(range, now)), loadCustomers(range, now)]);
  return (
    <OwnerShell section="visitors" range={range} now={now}>
      {t.value ? (
        <VisitorsSection t={t.value} v={v.value} who={whoResolver(c.value)} now={now} />
      ) : (
        <EmptyState title="No visitor data yet">{visitorsError(t.error)}</EmptyState>
      )}
    </OwnerShell>
  );
}
