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
import { getActiveProjectOrNull } from "@/lib/active-project";
import { platformUsageStatus } from "@/lib/dataforseo-usage";
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
  // Usage is metered per project (the shared budget is per-owner, but
  // check_serp's daily cap is per-project) - read it off the dashboard's
  // active project. A brand-new active subscriber with no project yet just
  // doesn't see the section; getActiveProjectOrNull never redirects.
  const activeProject = active && polarConfigured() ? await getActiveProjectOrNull() : null;
  const usage = activeProject ? await platformUsageStatus(activeProject.id) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader
        title="Billing"
        hint={
          active
            ? `You're on ${TIER_COPY[sub!.tier].name} - ${sub!.sites_limit} site${sub!.sites_limit === 1 ? "" : "s"}, ${sub!.keywords_limit} tracked keywords.`
            : "Pick a plan to unlock your sites - Starter comes with a 7-day free trial."
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
          {active
            ? "We couldn't open the billing portal - this account has no payment record with our provider. If you just subscribed, give it a minute and retry; otherwise contact support."
            : "No billing history yet - pick a plan first."}
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
              {tier === "starter" && !active ? (
                <p className="mt-1 text-xs font-medium text-emerald-300">7-day free trial</p>
              ) : null}
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

      {usage ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
          <h3 className="font-semibold text-white">DataForSEO usage this period</h3>
          {usage.billed_to === "platform" ? (
            <>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-neutral-300">
                    ${usage.month_to_date_usd.toFixed(2)} of ${usage.budget_usd.toFixed(2)}
                  </span>
                  <span className="text-neutral-500">{Math.min(usage.percent_used, 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${
                      usage.percent_used >= 100
                        ? "bg-red-500"
                        : usage.percent_used >= 80
                          ? "bg-amber-400"
                          : "bg-emerald-400"
                    }`}
                    style={{ width: `${Math.min(usage.percent_used, 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm text-neutral-400">
                check_serp today: {usage.check_serp_today} of {usage.check_serp_daily_cap}
              </p>
              <p className="mt-2 text-xs text-neutral-500">
                Resets{" "}
                {new Date(usage.resets_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                UTC. Connect your own DataForSEO account on{" "}
                <a href="/settings" className="text-neutral-300 underline">
                  Settings
                </a>{" "}
                for unmetered usage.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-neutral-400">
              {usage.billed_to === "own"
                ? "Your active project uses its own connected DataForSEO account - it doesn't draw from a plan budget."
                : "Your active project has no DataForSEO connected yet, so there's nothing to meter."}
            </p>
          )}
        </div>
      ) : null}

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
