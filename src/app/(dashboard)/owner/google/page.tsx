import { googleReport, productProjectId } from "@/lib/owner-insights";
import { EmptyState } from "@/components/ui/empty-state";
import { allSitesOf, loadCustomers, ownerGate, settle, siteHrefsOf } from "../data";
import { GoogleSection } from "../insights-view";
import { OwnerShell } from "../shell";

export const dynamic = "force-dynamic";

export default async function OwnerGooglePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const [c, productId] = await Promise.all([loadCustomers(range, now), productProjectId().catch(() => null)]);
  const sites = allSitesOf(c.value);
  const g = await settle(googleReport(range, productId, sites, now));
  return (
    <OwnerShell section="google" range={range} now={now}>
      {g.value ? <GoogleSection g={g.value} hrefs={siteHrefsOf(sites)} /> : <EmptyState title="Google data could not be read">{g.error ?? "unknown error"}</EmptyState>}
    </OwnerShell>
  );
}
