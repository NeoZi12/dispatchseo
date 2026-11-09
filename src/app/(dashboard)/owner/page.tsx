import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { loadCustomers, loadTraffic, ownerGate, visitorsError, whoResolver } from "./data";
import { OwnerShell, OWNER_SECTIONS } from "./shell";
import { KpiStrip, PublishPanel, SignupsSection } from "./view";
import { FOCUS_RING, cx } from "@/components/ui/styles";

// The operator's analytics, split into pages (see shell.tsx). Home is the
// day's numbers: signups, revenue, cost, and the articles that went live.
//
// Operator-only telemetry with no MCP counterpart, on purpose: an MCP token
// is one tenant, and nothing here is one tenant's to read.
export const dynamic = "force-dynamic";

export default async function OwnerHomePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range, now } = await ownerGate(searchParams);
  const [t, c] = await Promise.all([loadTraffic(range, now), loadCustomers(range, now)]);
  const traffic = t.value;
  const customers = c.value;
  const who = whoResolver(customers);
  const q = range === 30 ? "" : `?range=${range}`;
  return (
    <OwnerShell section="home" range={range} now={now}>
      <KpiStrip t={traffic} c={customers} />

      {traffic ? <SignupsSection t={traffic} c={customers} who={who} now={now} /> : <EmptyState title="No visitor data yet">{visitorsError(t.error)}</EmptyState>}

      {traffic && customers ? <PublishPanel t={traffic} c={customers} /> : null}

      <nav aria-label="More" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {OWNER_SECTIONS.filter((s) => s.key !== "home").map((s) => (
          <Link
            key={s.key}
            href={`${s.href}${q}`}
            className={cx("rounded-2xl border border-line-soft bg-surface px-5 py-4 transition-colors hover:bg-surface-2/60", FOCUS_RING)}
          >
            <span className="block text-[14px] font-medium text-ink">{s.label}</span>
            <span className="mt-1 block text-[12.5px] leading-snug text-ink-faint">{s.says}</span>
          </Link>
        ))}
      </nav>
    </OwnerShell>
  );
}
