import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { getSubscription, isActive, polarConfigured, TIER_LIMITS, type Tier } from "@/lib/billing";
import { DispatchMark } from "@/components/logo";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

export const dynamic = "force-dynamic";

// Standalone post-signup plan picker. This is the FIRST screen a fresh cloud
// account lands on - no dashboard sidebar, no chrome, just "welcome, pick a
// plan". Once a subscription is active they're bounced to onboarding to set up
// their first site; self-host has no billing and goes straight to the app.

const TIER_COPY: Record<
  Tier,
  { name: string; tagline: string; cta: string; recommended: boolean }
> = {
  starter: {
    name: "Starter",
    tagline: "One site on autopilot",
    cta: "Start free trial",
    recommended: false,
  },
  growth: {
    name: "Growth",
    tagline: "For a small portfolio",
    cta: "Choose Growth",
    recommended: true,
  },
  scale: {
    name: "Scale",
    tagline: "Portfolios and agencies",
    cta: "Choose Scale",
    recommended: false,
  },
};

// Truthful to what the SEO autopilot actually does - no invented numbers.
const CAPABILITIES = [
  "Autonomous keyword research",
  "Daily rank + Search Console tracking",
  "One-tap PR merge for content",
];

function Check({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4.5 10.5l3.2 3.2 7.8-8.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function PlansPage() {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const sub = await getSubscription(auth.user.id);
  if (isActive(sub)) redirect("/onboarding?new=1");

  const tiers = Object.keys(TIER_LIMITS) as Tier[];

  return (
    <main className="relative min-h-screen overflow-hidden bg-neutral-950 px-5 py-8 sm:px-6 sm:py-10">
      {/* Signature: a soft violet pool bleeding down from the top, densest
          behind the recommended card. Kept low-opacity so it reads as
          atmosphere, not decoration. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[560px] bg-[radial-gradient(60%_50%_at_50%_-8%,rgba(139,92,246,0.16),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-5xl">
        {/* Brand bar - mirrors the onboarding shell so the two standalone
            screens feel like one flow. */}
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2.5 text-lg font-semibold text-white">
            <DispatchMark className="h-7 w-auto" />
            DispatchSEO
          </p>
        </div>

        {/* Welcome hero. The mascot settles in for the shift, then the ask. */}
        <div className="mt-10 flex flex-col items-center text-center sm:mt-14">
          <PixelDispatcher className="mb-6 w-[min(200px,60vw)]" />
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Choose your plan
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-neutral-400">
            Pick a plan to put your site&apos;s SEO on autopilot. Starter includes a 7-day free
            trial &mdash; cancel anytime.
          </p>
        </div>

        {!polarConfigured() ? (
          <p className="mx-auto mt-8 max-w-xl rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-3 text-center text-sm text-amber-300">
            Billing isn&apos;t configured on this deployment yet (POLAR_* env vars missing).
          </p>
        ) : null}

        {/* Plans. Decision-first order inside each card (price -> CTA -> the
            comparison list) keeps the buttons aligned across tiers. */}
        <div className="mt-12 grid items-start gap-5 sm:grid-cols-3">
          {tiers.map((tier) => {
            const limits = TIER_LIMITS[tier];
            const copy = TIER_COPY[tier];
            const rec = copy.recommended;
            return (
              <div
                key={tier}
                className={[
                  "relative flex flex-col rounded-2xl p-6 transition duration-200",
                  rec
                    ? "z-10 border border-violet-500/40 bg-neutral-900/60 ring-1 ring-violet-500/20 shadow-[0_0_70px_-20px_rgba(139,92,246,0.55)] hover:-translate-y-0.5 hover:border-violet-500/60 lg:scale-[1.035]"
                    : "border border-neutral-800 bg-neutral-900/40 hover:-translate-y-0.5 hover:border-neutral-700",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-white">{copy.name}</h2>
                  {rec ? (
                    <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-violet-300 ring-1 ring-inset ring-violet-500/30">
                      Most popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-neutral-400">{copy.tagline}</p>

                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums text-white">
                    ${limits.price}
                  </span>
                  <span className="text-sm text-neutral-500">/mo</span>
                </div>
                {tier === "starter" ? (
                  <p className="mt-1.5 text-xs font-medium text-emerald-300">7-day free trial</p>
                ) : (
                  <p className="mt-1.5 text-xs font-medium text-neutral-500">Billed today</p>
                )}

                <a
                  href={`/api/polar/checkout?tier=${tier}`}
                  className={[
                    "mt-6 flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                    rec
                      ? "bg-white text-neutral-950 hover:bg-neutral-200"
                      : "border border-neutral-700 bg-neutral-900 text-white hover:border-violet-500/40 hover:bg-neutral-800/60",
                  ].join(" ")}
                >
                  {copy.cta}
                </a>

                <div className="mt-6 border-t border-neutral-800 pt-6">
                  <ul className="space-y-3 text-sm">
                    <li className="flex items-start gap-2.5 text-neutral-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span>
                        <span className="font-medium text-white tabular-nums">{limits.sites}</span>{" "}
                        site{limits.sites === 1 ? "" : "s"}
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-neutral-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                      <span>
                        <span className="font-medium text-white tabular-nums">
                          {limits.keywords}
                        </span>{" "}
                        tracked keywords
                      </span>
                    </li>
                    {CAPABILITIES.map((cap) => (
                      <li key={cap} className="flex items-start gap-2.5 text-neutral-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reassurance + the legal line, quiet at the base of the page. */}
        <div className="mt-10 space-y-1 text-center">
          <p className="text-sm text-neutral-500">Cancel anytime &middot; 7-day free trial on Starter</p>
          <p className="text-sm text-neutral-500">
            By subscribing you agree to the{" "}
            <a className="text-neutral-300 underline underline-offset-2" href="/terms">
              terms of service
            </a>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
