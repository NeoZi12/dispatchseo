import { visitorsReport } from "@/lib/owner-visitors";
import { EmptyState } from "@/components/ui/empty-state";
import { loadCustomers, loadTraffic, ownerGate, settle, visitorsError, whoResolver } from "./data";
import { OwnerShell } from "./shell";
import { VisitorsSection } from "./visitors-view";

// The operator's analytics, split into pages (see shell.tsx). Home is the
// visitors: who reached dispatchseo.com and how they found it. Nothing else
// on it, on purpose (owner, 2026-11-09: the rest of the old home was noise).
//
// Operator-only telemetry with no MCP counterpart, on purpose: an MCP token
// is one tenant, and nothing here is one tenant's to read.
export const dynamic = "force-dynamic";

export default async function OwnerHomePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const [t, v, c] = await Promise.all([loadTraffic(range, now), settle(visitorsReport(range, now)), loadCustomers(range, now)]);
  return (
    <OwnerShell section="home" range={range} now={now}>
      {t.value ? (
        <VisitorsSection t={t.value} v={v.value} who={whoResolver(c.value)} now={now} />
      ) : (
        <EmptyState title="No visitor data yet">{visitorsError(t.error)}</EmptyState>
      )}
    </OwnerShell>
  );
}
