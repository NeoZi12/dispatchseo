import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import {
  getSubscription,
  isActive,
  polarConfigured,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

// Cloud-only plan page: current subscription + the three tiers. Checkout and
// the customer portal are handled by Polar's hosted pages; this page only
// links out. Self-host has no billing, so it bounces home.

const TIER_COPY: Record<Tier, { name: string; sub: string }> = {
  starter: { name: "Starter", sub: "One site on autopilot" },
  growth: { name: "Growth", sub: "For a small portfolio" },
  scale: { name: "Scale", sub: "Portfolios and agencies" },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const { success, error } = await searchParams;
  const sub = await getSubscription(auth.user.id);
  const active = isActive(sub);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Billing"
        hint={
          active
            ? `You're on ${TIER_COPY[sub!.tier].name} - ${sub!.sites_limit} site${sub!.sites_limit === 1 ? "" : "s"}, ${sub!.keywords_limit} tracked keywords.`
            : "Pick a plan to unlock your sites."
        }
      />

      {success ? (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-emerald-900 bg-emerald-950/40 px-4 py-3">
          <p className="text-sm text-emerald-300">
            Payment received - your plan is active. Welcome aboard.
          </p>
          <a
            href="/onboarding?new=1"
            className="shrink-0 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950"
          >
            Set up your site →
          </a>
        </div>
      ) : null}
      {error === "no-customer" ? (
        <p className="rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-400">
          No billing history yet - pick a plan first.
        </p>
      ) : null}
      {!polarConfigured() ? (
        <p className="rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
          Billing isn&apos;t configured on this deployment yet (POLAR_* env vars missing).
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {(Object.keys(TIER_COPY) as Tier[]).map((tier) => {
          const limits = TIER_LIMITS[tier];
          const isCurrent = active && sub?.tier === tier;
          return (
            <div
              key={tier}
              className={`rounded-xl border p-5 ${isCurrent ? "border-white/40 bg-neutral-900" : "border-neutral-800 bg-neutral-950"}`}
            >
              <h3 className="font-semibold text-white">{TIER_COPY[tier].name}</h3>
              <p className="mt-1 text-2xl font-bold text-white">
                ${limits.price}
                <span className="text-sm font-normal text-neutral-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-neutral-400">{TIER_COPY[tier].sub}</p>
              <ul className="mt-3 space-y-1 text-sm text-neutral-400">
                <li>
                  {limits.sites} site{limits.sites === 1 ? "" : "s"}
                </li>
                <li>{limits.keywords} tracked keywords</li>
              </ul>
              {isCurrent ? (
                <p className="mt-4 text-center text-sm font-medium text-neutral-300">
                  Current plan
                </p>
              ) : (
                <a
                  // Active subscribers change plans in Polar's portal (it
                  // prorates and REPLACES the subscription); a fresh checkout
                  // would stack a second parallel subscription.
                  href={active ? "/api/polar/portal" : `/api/polar/checkout?tier=${tier}`}
                  className="mt-4 block rounded-lg bg-white px-4 py-2 text-center text-sm font-medium text-neutral-950"
                >
                  {active ? "Switch" : "Choose"} {TIER_COPY[tier].name}
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-sm text-neutral-500">
        Invoices, payment method, plan changes, cancellation:{" "}
        <a className="text-neutral-300 underline" href="/api/polar/portal">
          open the billing portal
        </a>
        . By subscribing you agree to the{" "}
        <a className="text-neutral-300 underline" href="/terms">
          terms of service
        </a>
        .
      </p>
    </div>
  );
}
