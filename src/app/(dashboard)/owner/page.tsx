import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customersReport, parseRange, RANGES, trafficReport, type CustomersReport, type TrafficReport } from "@/lib/owner-analytics";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeading } from "@/components/ui/page-heading";
import { Tabs } from "@/components/ui/tabs";
import { ActivitySection, CrawlersSection, CustomersSection, DashboardUseSection, FunnelSection, PublishSection, TrafficSection } from "./view";

// The operator's analytics: who reaches the site, who signs up, and what
// every customer earns and costs. Cloud: OPERATOR_USER_IDS only, 404 for
// anyone else (the page does not exist for a customer). Self-host: the one
// owner, whose "site" is their own dashboard host - mostly the hosted blog
// and crawler numbers are of use there.
//
// Operator-only telemetry with no MCP counterpart, on purpose: an MCP token
// is one tenant, and nothing here is one tenant's to read.
export const dynamic = "force-dynamic";

export default async function OwnerPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const auth = await requireDashboard();
  if (isCloudMode() && !isOperator(auth.user?.id)) notFound();
  const range = parseRange((await searchParams).range);
  const now = Date.now();

  // Each half fails on its own: a missing migration or a slow Polar must
  // never blank the other.
  const settle = <T,>(p: Promise<T>): Promise<{ value: T; error: null } | { value: null; error: string }> =>
    p.then((value) => ({ value, error: null }), (e: unknown) => ({ value: null, error: e instanceof Error ? e.message : String(e) }));
  const [t, c] = await Promise.all([settle(trafficReport(range, now)), settle(customersReport(range, now))]);
  const traffic: TrafficReport | null = t.value;
  const customers: CustomersReport | null = c.value;
  const trafficError = t.error;
  const customersError = c.error;

  const emailOf = new Map<string, string>();
  const siteOf = new Map<string, string>();
  for (const c of customers?.customers ?? []) {
    emailOf.set(c.userId, c.email);
    for (const s of c.sites) siteOf.set(s.id, s.domain);
  }
  for (const s of customers?.orphanSites ?? []) siteOf.set(s.id, s.domain);
  const who = (id: string) => emailOf.get(id) ?? siteOf.get(id) ?? (id.startsWith("setup:") ? "someone (before signup)" : id.length > 20 ? id.slice(0, 8) : id);

  return (
    <div className="space-y-6">
      <PageHeading
        title="Owner"
        description="Who reaches dispatchseo.com, who signs up, and what every customer earns and costs. Only you see this page."
        actions={
          <Tabs
            label="Range"
            className="border-b-0"
            items={RANGES.map((r) => ({ href: `/owner?range=${r}`, label: `${r} days`, active: r === range }))}
          />
        }
      />

      {traffic ? (
        <>
          <TrafficSection t={traffic} />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <FunnelSection t={traffic} />
            </div>
            <div className="space-y-6 lg:col-span-2">
              <PublishSection t={traffic} totalRecent={customers?.totals.articlesRecent ?? null} totalAll={customers?.totals.articles ?? null} />
              <DashboardUseSection t={traffic} c={customers} />
            </div>
          </div>
        </>
      ) : (
        <EmptyState title="No traffic data yet">
          {trafficError?.includes("owner_visits") || trafficError?.includes("web_visits")
            ? "Migration 0073 (owner analytics) has not been applied to this database yet. Apply it and reload."
            : `The traffic read failed: ${trafficError ?? "unknown error"}.`}
        </EmptyState>
      )}

      {customers ? (
        <CustomersSection c={customers} range={range} now={now} />
      ) : isCloudMode() ? (
        <EmptyState title="Customers could not be read">{customersError ?? "unknown error"}</EmptyState>
      ) : null}

      {traffic ? (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <ActivitySection t={traffic} who={who} now={now} />
          </div>
          <div className="lg:col-span-2">
            <CrawlersSection t={traffic} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
