import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { isCloudMode } from "@/lib/cloud";
import { latestQualifier } from "@/lib/qualifier";
import {
  annualBillingAvailable,
  annualCharge,
  annualSavingsPct,
  getSubscription,
  isActive,
  isBillingInterval,
  monthlyPrice,
  polarConfigured,
  priceLabel,
  TIER_LIMITS,
  articlesPerWeekFor,
  type BillingInterval,
  type Tier,
} from "@/lib/billing";
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
    tagline: "For a bigger portfolio",
    cta: "Choose Scale",
    recommended: false,
  },
};

// Truthful to what the SEO autopilot actually does - no invented numbers.
// Since 2026-10-23 cloud sites are written and published by our server (the
// hosted writer), so there is no PR for the owner to merge any more.
const CAPABILITIES = [
  "Keyword research done for you, every week",
  "Daily rank + Search Console tracking",
  "Pauses itself if Google stops showing your site",
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

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const sub = await getSubscription(auth.user.id);
  if (isActive(sub)) redirect("/onboarding?new=1");

  // Nobody reaches a price until we know we can serve them. /qualify asks what
  // the site is built on and which AI will drive it, and only writes
  // proceeded=true when both answers are ones we can actually deliver on.
  // Both answers now have several right ones (WordPress or a repo; the Claude
  // app or a coding agent), so this gate is no longer "do you have a repo" - it
  // is the shorter list of combinations nothing can serve: ChatGPT-only,
  // Gemini, no AI at all, or a site on Wix, Squarespace, Shopify, Webflow,
  // Framer or Ghost. Before it existed, a WordPress owner paid first and found
  // out at wizard screen c1 that there was no repo to connect, which is how two
  // of the four real trials ended, one of them inside five minutes.
  //
  // latestQualifier() answers null on any DB error, which would send someone
  // back to /qualify rather than into a checkout we cannot honour. That is the
  // safe direction: the worst case is one extra screen, not a bad charge.
  const qualifier = await latestQualifier(auth.user.id);
  if (!qualifier?.proceeded) redirect("/qualify");

  // Monthly or yearly. The yearly plan exists only once all three yearly Polar
  // products are configured; a ?interval=year on a deployment without them
  // falls back to monthly here so the page never shows a price the checkout
  // route would then refuse (it 400s on a missing yearly product).
  const annual = annualBillingAvailable();
  const sp = await searchParams;
  // Yearly is the default when it exists (it is the better deal and the
  // landing defaults to it too); ?interval=month switches. Without yearly
  // products there is only monthly.
  const requested = typeof sp.interval === "string" ? sp.interval : "year";
  const interval: BillingInterval = annual && isBillingInterval(requested) ? requested : "month";
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

          {/* Monthly / yearly. Two links, not a client toggle: the page is a
              server component and the choice is a URL, so a refresh, a back
              button and a shared link all land on the same prices. */}
          {annual ? (
            <div
              role="group"
              aria-label="Billing period"
              className="mt-8 inline-flex items-center rounded-full border border-neutral-800 bg-neutral-900/60 p-1 text-sm"
            >
              {(["month", "year"] as const).map((opt) => {
                const on = interval === opt;
                return (
                  <a
                    key={opt}
                    href={opt === "month" ? "/plans?interval=month" : "/plans"}
                    aria-current={on ? "true" : undefined}
                    className={[
                      "rounded-full px-4 py-1.5 font-medium transition-colors",
                      on ? "bg-white text-neutral-950" : "text-neutral-400 hover:text-white",
                    ].join(" ")}
                  >
                    {opt === "month" ? "Monthly" : (
                      <>
                        Yearly{" "}
                        <span className={on ? "text-violet-700" : "text-violet-300"}>
                          save {annualSavingsPct("starter")}%
                        </span>
                      </>
                    )}
                  </a>
                );
              })}
            </div>
          ) : null}
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

                <div className="mt-5 flex flex-wrap items-baseline gap-x-1">
                  <span className="text-4xl font-semibold tracking-tight tabular-nums text-white">
                    {priceLabel(monthlyPrice(tier, interval))}
                  </span>
                  <span className="text-sm text-neutral-500">/mo</span>
                </div>
                {/* The whole truth under the number: what the card actually
                    charges and when. A yearly plan shown as "$20/mo" without
                    the $240 beside it is the kind of pricing page people
                    screenshot. */}
                <p className="mt-1 text-xs text-neutral-500 tabular-nums">
                  {interval === "year"
                    ? `${priceLabel(annualCharge(tier))} billed yearly`
                    : annual
                      ? `or ${priceLabel(TIER_LIMITS[tier].annual)}/mo billed yearly`
                      : "billed monthly"}
                </p>
                {tier === "starter" ? (
                  <p className="mt-1.5 text-xs font-medium text-emerald-300">7-day free trial</p>
                ) : (
                  <p className="mt-1.5 text-xs font-medium text-neutral-500">Billed today</p>
                )}

                {/* ABOVE the button, deliberately. This is a pass-through cost
                    the buyer pays to someone else, so it has to be read before
                    the click, not found afterwards - it sat below the feature
                    list until 2026-07-31, which technically disclosed it while
                    putting it where nobody scrolls. Multi-site tiers only: one
                    site cannot leave GitHub's free tier, so on Starter this
                    would warn about something that cannot happen. Never on the
                    public pricing section; the full table and the
                    spending-limit instruction live on the card shown when
                    someone adds their third site. */}
                {/* Off since 2026-10-23: cloud sites run on the hosted writer,
                    which runs nothing in the owner's repo, so there are no
                    GitHub Actions minutes to warn about. Kept (not deleted)
                    for an agent-mode plan, should one come back. */}
                {false ? (
                  <p className="mt-3 text-xs leading-relaxed text-neutral-400">
                    After your first two sites, GitHub charges about $5 per site a month - to
                    them, not to us.{" "}
                    <a
                      href="/docs/publishing#github-actions-costs"
                      className="underline underline-offset-2 hover:text-neutral-300"
                    >
                      See the cost table
                    </a>
                  </p>
                ) : null}

                <a
                  href={`/api/polar/checkout?tier=${tier}&interval=${interval}`}
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
                        <span className="font-medium text-white tabular-nums">{articlesPerWeekFor(tier)}</span>{" "}
                        article{articlesPerWeekFor(tier) === 1 ? "" : "s"} a week, written and published for you
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
          {/* The express-consent line required to validly waive the EU/UK
              14-day withdrawal right on a service that starts immediately.
              Without an affirmative request to begin performance AND an
              acknowledgement that the right is lost once performed, the
              "non-refundable" position in the terms is unenforceable against a
              consumer no matter what the terms say. It sits at the point of
              purchase because that is where the law wants it, not buried in
              the terms page it links to. */}
          <p className="mx-auto max-w-xl text-sm leading-relaxed text-neutral-500">
            Your subscription renews automatically until you cancel. By subscribing you agree to
            the{" "}
            <a className="text-neutral-300 underline underline-offset-2" href="/terms">
              terms of service
            </a>
            , and you ask us to start the service straight away - which means that once it has
            been fully performed you lose the 14-day right of withdrawal you would otherwise
            have as a consumer. Cancel any time from your billing page.
          </p>
        </div>
      </div>
    </main>
  );
}
