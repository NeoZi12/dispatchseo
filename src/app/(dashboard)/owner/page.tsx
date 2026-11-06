import Link from "next/link";
import { notFound } from "next/navigation";

import { requireDashboard } from "@/lib/auth-gate";
import { isOperator } from "@/lib/autopilot/operator";
import { isCloudMode } from "@/lib/cloud";
import { customersReport, parseRange, RANGES, trafficReport, type CustomersReport, type TrafficReport } from "@/lib/owner-analytics";
import { aiReport, googleReport, productProjectId, type AiReport, type GoogleReport } from "@/lib/owner-insights";
import { AiSection, GoogleSection } from "./insights-view";
import { cx, FOCUS_RING } from "@/components/ui/styles";
import { EmptyState } from "@/components/ui/empty-state";
import { CustomersPanel, KpiStrip, PublishPanel, SignupsSection, VisitorsSection } from "./view";
import { shortDate } from "./format";

// The operator's analytics: who reaches the site, who signs up, and what
// every customer earns and costs. Cloud: OPERATOR_USER_IDS only, 404 for
// anyone else (the page does not exist for a customer). Self-host: the one
// owner.
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
  const [t, c, productId] = await Promise.all([
    settle(trafficReport(range, now)),
    settle(customersReport(range, now)),
    productProjectId().catch(() => null),
  ]);
  const traffic: TrafficReport | null = t.value;
  const customers: CustomersReport | null = c.value;
  const allSites = [
    ...(customers?.customers ?? []).flatMap((x) => x.sites.map((s) => ({ id: s.id, domain: s.domain, owner: x.operator ? null : x.email, userId: x.userId }))),
    ...(customers?.orphanSites ?? []).map((s) => ({ id: s.id, domain: s.domain, owner: null, userId: null as string | null })),
  ];
  const [ai, google] = await Promise.all([
    settle(aiReport(range, productId, now)),
    settle(googleReport(range, productId, allSites, now)),
  ]);
  const aiData: AiReport | null = ai.value;
  const googleData: GoogleReport | null = google.value;
  const siteHrefs: Record<string, string> = Object.fromEntries(allSites.filter((s) => s.userId).map((s) => [s.id, `/owner/customers/${s.userId}`]));

  const emailOf = new Map<string, string>();
  const siteOf = new Map<string, string>();
  for (const x of customers?.customers ?? []) {
    emailOf.set(x.userId, x.email);
    for (const s of x.sites) siteOf.set(s.id, s.domain);
  }
  for (const s of customers?.orphanSites ?? []) siteOf.set(s.id, s.domain);
  const who = (id: string) => emailOf.get(id) ?? siteOf.get(id) ?? (id.startsWith("setup:") ? "a visitor" : id.length > 20 ? id.slice(0, 8) : id);

  const from = traffic ? new Date(traffic.from).toISOString() : null;
  const to = traffic ? new Date(traffic.to - 1).toISOString() : null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-ink">Owner</h1>
          <p className="mt-1 text-[13.5px] text-ink-muted">
            dispatchseo.com and every customer{from && to ? <span className="text-ink-faint"> · {shortDate(from)} – {shortDate(to)}, UTC</span> : null}
          </p>
        </div>
        <nav aria-label="Range" className="flex w-full rounded-xl border border-line-soft bg-surface p-1 sm:w-auto">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/owner?range=${r}`}
              scroll={false}
              aria-current={r === range ? "page" : undefined}
              className={cx(
                "flex-1 rounded-lg px-4 py-1.5 text-center font-mono text-[12.5px] tabular-nums transition-colors sm:flex-none",
                r === range ? "bg-surface-3 text-ink" : "text-ink-faint hover:text-ink",
                FOCUS_RING,
              )}
            >
              {r === 365 ? "12m" : `${r}d`}
            </Link>
          ))}
        </nav>
      </header>

      <KpiStrip t={traffic} c={customers} />

      {traffic ? (
        <VisitorsSection t={traffic} />
      ) : (
        <EmptyState title="No visitor data yet">
          {t.error?.includes("owner_visits") || t.error?.includes("web_visits")
            ? "Migration 0073 (owner analytics) has not been applied to this database yet. Apply it and reload."
            : `The visitor read failed: ${t.error ?? "unknown error"}.`}
        </EmptyState>
      )}

      {traffic ? <SignupsSection t={traffic} c={customers} who={who} now={now} /> : null}

      {customers ? (
        <CustomersPanel c={customers} t={traffic} range={range} now={now} />
      ) : isCloudMode() ? (
        <EmptyState title="Customers could not be read">{c.error ?? "unknown error"}</EmptyState>
      ) : null}

      {googleData ? <GoogleSection g={googleData} hrefs={siteHrefs} /> : null}

      {aiData ? <AiSection a={aiData} now={now} /> : null}

      {traffic && customers ? <PublishPanel t={traffic} c={customers} /> : null}
    </div>
  );
}
