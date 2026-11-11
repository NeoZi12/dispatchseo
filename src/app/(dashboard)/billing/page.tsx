import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { writerMode } from "../mode";
import { isCloudMode } from "@/lib/cloud";
import {
  annualBillingAvailable,
  annualCharge,
  articlesPerMonthFor,
  getSubscription,
  isActive,
  polarConfigured,
  priceLabel,
  sitesLimitOf,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { platformUsageStatus } from "@/lib/dataforseo-usage";
import { CancelPlanButton, KeepPlanButton } from "@/components/cancel-plan";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeading } from "@/components/ui/page-heading";
import { BackToSettings } from "../settings/more-links";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cx } from "@/components/ui/styles";
import { BTN_PRIMARY, BTN_SECONDARY } from "@/components/setup-stage/primitives";

export const dynamic = "force-dynamic";

// Cloud-only plan page, built so a stranger can use it in ten seconds
// (owner, 2026-10-24): one card on top says which plan you're on and what
// happens next, with "Change plan" and "Cancel plan" right there. Below it,
// the three plans as three cards, then one link for payment method and
// invoices. Checkout and the customer portal are Polar's hosted pages;
// this page only links out. Self-host has no billing, so it bounces home.

const TIER_COPY: Record<Tier, { name: string; sub: string }> = {
  starter: { name: "Starter", sub: "A steady start" },
  growth: { name: "Growth", sub: "For a small portfolio" },
  scale: { name: "Scale", sub: "For a bigger portfolio" },
};

// "1 website" / "Up to 3 websites": a plan's site allowance, worded as on every
// plan card (owner, 2026-11-11). An owner may use fewer sites than the plan
// covers, hence "Up to N".
// The pricing card's own copy, the same words as setup's plan step
// (setup-stage/scenes.tsx WHO and PAID_ROWS), the landing page and /plans.
// Tick rows are always ONE row (owner rule, 2026-11-09): keep each short.
const WHO: Record<Tier, string> = {
  starter: "Steady start, monthly articles",
  growth: "Serious about traffic",
  scale: "All in on content",
};
const PAID_ROWS = ["Topics people search for", "Rankings and analytics", "No badge"];

function Tick() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3.5 8.5 3 3 6-7" />
    </svg>
  );
}

function sitesLine(sites: number): string {
  return sites === 1 ? "1 website" : `Up to ${sites} websites`;
}


export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const { success, error } = await searchParams;
  // Which product the plan cards describe: a hosted site is sold articles a
  // month; an agent site runs on GitHub Actions, whose cost note applies.
  // The project and the subscription are independent reads: together.
  const [activeOrNull, sub, owned] = await Promise.all([getActiveProjectOrNull(), getSubscription(auth.user.id), scopedProjects()]);
  const hostedMode = writerMode(activeOrNull) === "hosted";
  const active = isActive(sub);
  // A subscription Polar still holds, whatever its payment state. `active`
  // (active|trialing) decides what we UNLOCK; this decides where a plan button
  // may send someone. past_due is not active - the plan is unpaid - but the
  // subscription does still exist upstream, so the way out is the portal (fix
  // the card, prorate, replace). A fresh checkout would stack a second
  // subscription beside the unpaid one and charge the same account twice.
  const hasUpstreamSub = Boolean(sub && ["active", "trialing", "past_due"].includes(sub.status));
  // The usage meter only means something for an agent site on the platform
  // DataForSEO budget; a hosted site's research is ours to pay for.
  const activeProject = active && polarConfigured() && !hostedMode ? activeOrNull : null;
  const usage = activeProject ? await platformUsageStatus(activeProject.id) : null;
  // Only for the sentence the cancel dialog writes ("new articles stop on
  // your 3 sites"). The owner's own list, already read for the layout's
  // switcher (scopedProjects is cached per request); a failed read is
  // empty there, which reads as one site here.
  const siteCount = hasUpstreamSub ? Math.max(owned.length, 1) : 0;
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end) : null;
  const periodEndLabel =
    periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;

  // The plan's state in one word and one line. A cancelled plan still says
  // what's true first - it's running - then until when.
  const state: { word: string; tone: StatusTone; line: string } | null = !sub || !hasUpstreamSub
    ? null
    : sub.status === "past_due"
      ? { word: "Payment failed", tone: "warn", line: "Your last payment didn't go through. Update your card to keep it running." }
      : sub.cancel_at_period_end
        ? { word: "Cancelled", tone: "warn", line: periodEndLabel ? `Runs until ${periodEndLabel}, then stops. You won't be charged again.` : "Runs to the end of this period, then stops." }
        : sub.status === "trialing"
          ? { word: "Free trial", tone: "ok", line: periodEndLabel ? `Trial ends ${periodEndLabel}, then it renews.` : "Your trial renews into the plan when it ends." }
          : { word: "Active", tone: "ok", line: periodEndLabel ? `Renews ${periodEndLabel}.` : "Renews each period." };

  const perMonth = sub ? articlesPerMonthFor(sub.tier) : 0;

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {/* Reached from Settings now, not from a sidebar row of its own. */}
      <div className="space-y-3">
        <BackToSettings />
        <PageHeading title="Billing" />
      </div>

      {success ? (
        <Callout
          tone="ok"
          role="status"
          title="Payment received. Your plan is active."
          action={
            <a href="/dashboard" className={buttonClass("primary", "sm")}>
              Back to your site
            </a>
          }
        />
      ) : null}
      {error === "no-customer" ? (
        <Callout tone="warn" role="status" title={active ? "The billing portal didn't open" : "No billing history yet"}>
          {active ? (
            <>
              This account has no payment record with our provider yet. If you just subscribed, give it a minute and retry; otherwise email{" "}
              <a href="mailto:support@dispatchseo.com" className="underline underline-offset-2">
                support@dispatchseo.com
              </a>
              .
            </>
          ) : (
            "Pick a plan first."
          )}
        </Callout>
      ) : null}
      {!polarConfigured() ? <Callout tone="warn" title="Billing isn't configured on this deployment yet (POLAR_* env vars missing)." /> : null}

      {/* ---- your plan ---- */}
      <section aria-labelledby="plan-title" className="space-y-4">
        <h2 id="plan-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
          Your plan
        </h2>
        <div className="rounded-2xl border border-line-soft bg-surface p-6 sm:p-7">
          {sub && state ? (
            <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
                  <p className="text-[2rem] font-semibold leading-none tracking-tight text-ink">{TIER_COPY[sub.tier].name}</p>
                  <StatusPill tone={state.tone}>{state.word}</StatusPill>
                </div>
                <p className="mt-3 text-[15px] text-ink">
                  {hostedMode
                    ? `${perMonth} ${perMonth === 1 ? "article" : "articles"} a month, ${sitesLine(sitesLimitOf(sub)).replace(/^Up/, "up")}`
                    : sitesLine(sitesLimitOf(sub))}
                </p>
                <p className="mt-1 text-[14px] text-ink-muted">{state.line}</p>
              </div>
              <div className="flex flex-wrap items-start gap-3">
                <a href="/api/polar/portal" className={buttonClass(sub.status === "past_due" ? "primary" : "secondary", "md")}>
                  {sub.status === "past_due" ? "Update payment" : "Payment and invoices"}
                </a>
                {sub.cancel_at_period_end ? (
                  <KeepPlanButton />
                ) : (
                  <CancelPlanButton endsAt={sub.current_period_end} tierName={TIER_COPY[sub.tier].name} siteCount={siteCount} />
                )}
              </div>
            </div>
          ) : (
            <>
              {/* No live plan = the free tier (billing.ts isFreePlan), which is
                  what the Free pill on the settings menu's Billing row says too. */}
              <p className="text-[1.25rem] font-semibold tracking-tight text-ink">You&apos;re on the free plan</p>
              <p className="mt-2 text-[15px] text-ink-muted">Pick a plan below for more articles a month, keyword research, rankings and advanced analytics.</p>
            </>
          )}
        </div>
      </section>

      {/* ---- the plans ---- */}
      {/* The pricing card every other surface uses (setup's plan step, the
          landing page, /plans): name, the price big, who it's for in violet,
          then tick rows that never wrap. The owner's own plan carries the
          violet border and a "Your plan" pill. */}
      <section id="plans" aria-labelledby="plans-title" className="scroll-mt-24 space-y-4">
        <h2 id="plans-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
          {hasUpstreamSub ? "Change plan" : "Plans"}
        </h2>
        <div className="grid gap-x-4 gap-y-7 pt-3 md:grid-cols-3">
          {(Object.keys(TIER_COPY) as Tier[]).map((tier) => {
            const limits = TIER_LIMITS[tier];
            const isCurrent = active && sub?.tier === tier;
            const monthly = articlesPerMonthFor(tier);
            const rows = hostedMode
              ? [`${monthly} ${monthly === 1 ? "article" : "articles"} a month`, sitesLine(limits.sites), ...PAID_ROWS, ...(tier === "scale" ? ["Priority support"] : [])]
              : [sitesLine(limits.sites), TIER_COPY[tier].sub];
            return (
              <div
                key={tier}
                // flex column + mt-auto on the button: the cards carry
                // different amounts of copy, and the buttons still line up.
                className={cx(
                  "relative flex flex-col rounded-2xl bg-surface px-5 pb-5 pt-6",
                  isCurrent ? "border-2 border-accent-strong shadow-[0_0_60px_-24px_rgba(139,92,246,0.7)]" : "border border-line",
                )}
              >
                {isCurrent ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-accent-strong px-3 py-1 text-[11.5px] font-bold tracking-wide text-white">Your plan</span>
                ) : tier === "growth" && !hasUpstreamSub ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-accent-strong px-3 py-1 text-[11.5px] font-bold tracking-wide text-white">Most popular</span>
                ) : null}

                <h3 className="text-[17px] font-bold text-ink">{TIER_COPY[tier].name}</h3>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-[36px] font-extrabold leading-none tracking-tight text-white tabular-nums">{priceLabel(limits.price)}</span>
                  <span className="text-[14px] font-semibold text-ink-faint">/mo</span>
                </p>
                <p className="mt-1.5 text-[13px] font-medium text-ink-muted tabular-nums">
                  {annualBillingAvailable() ? `or ${priceLabel(limits.annual)} a month, billed yearly` : "Billed monthly"}
                </p>
                <p className="mt-1 text-[13.5px] font-medium text-accent">{WHO[tier]}</p>

                <ul className="mt-5 space-y-1 text-[14px] text-ink">
                  {rows.map((r, i) => (
                    <li key={r} className={cx("flex items-center gap-2.5 whitespace-nowrap py-1", i === 0 ? "font-semibold" : "")}>
                      <Tick />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>

                {/* Multi-site tiers on an agent site only: after two sites
                    GitHub Actions bills the owner, and an upgrade is exactly
                    when that becomes possible - so it sits above the button. */}
                {tier !== "starter" && !hostedMode ? (
                  <p className="mt-3 text-[12px] leading-relaxed text-ink-faint">
                    After your first two sites, GitHub charges about $5 per site a month - to them, not to us.{" "}
                    <a href="/docs/publishing#github-actions-costs" className="underline underline-offset-2 hover:text-ink-muted">
                      See the cost table
                    </a>
                  </p>
                ) : null}

                <div className="mt-auto pt-6">
                  {isCurrent ? (
                    <p className="flex h-11 items-center justify-center rounded-xl border border-line-soft text-[14px] font-medium text-ink-muted">Your current plan</p>
                  ) : (
                    <a
                      // Existing subscribers change plans in Polar's portal (it
                      // prorates and REPLACES the subscription); a fresh checkout
                      // would stack a second parallel subscription. Gated on
                      // hasUpstreamSub, not `active`: a past_due subscriber
                      // sent to checkout would be billed twice.
                      href={hasUpstreamSub ? "/api/polar/portal" : `/api/polar/checkout?tier=${tier}`}
                      className={cx(hasUpstreamSub ? BTN_SECONDARY : BTN_PRIMARY, "h-11 w-full rounded-xl py-0 text-[14.5px]")}
                    >
                      {hasUpstreamSub ? `Switch to ${TIER_COPY[tier].name}` : `Choose ${TIER_COPY[tier].name}`}
                    </a>
                  )}
                  {!isCurrent && !hasUpstreamSub ? <p className="mt-2 text-center text-[12.5px] font-medium text-ink-faint">Billed today</p> : null}
                  {!isCurrent && !hasUpstreamSub && annualBillingAvailable() ? (
                    <a href={`/api/polar/checkout?tier=${tier}&interval=year`} className="mt-1 block text-center text-[12.5px] text-ink-faint underline decoration-line underline-offset-4 hover:text-ink">
                      Or pay yearly: {priceLabel(annualCharge(tier))} a year
                    </a>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
        {/* How a plan's articles reach its sites - the same line as the
            landing's pricing section and /plans. */}
        <div className="space-y-0.5 text-[13.5px] text-ink-muted">
          <p>Use one site and it gets all of them. Add more and we split them for you.</p>
        </div>
        {/* The point of purchase for an upgrade, so the same express-consent
            line /plans and setup's checkout step carry (EU/UK 14-day
            withdrawal waiver - see app/plans/page.tsx). */}
        {!hasUpstreamSub ? (
          <p className="text-[12.5px] leading-relaxed text-ink-faint">
            Your subscription renews automatically until you cancel. By subscribing you agree to the{" "}
            <a className="underline underline-offset-2 hover:text-ink-muted" href="/terms">
              terms of service
            </a>
            , and you ask us to start the service straight away - which means that once it has been fully performed you lose the 14-day right of
            withdrawal you would otherwise have as a consumer. Cancel any time from this page.
          </p>
        ) : null}
      </section>

      {usage ? (
        <section aria-labelledby="usage-title" className="rounded-xl border border-line-soft bg-surface p-5">
          <h2 id="usage-title" className="text-[15px] font-semibold text-ink">
            DataForSEO usage this period
          </h2>
          {usage.billed_to === "platform" ? (
            <>
              <div className="mt-3 space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-ink">
                    ${usage.month_to_date_usd.toFixed(2)} of ${usage.budget_usd.toFixed(2)}
                  </span>
                  <span className="text-ink-faint">{Math.min(usage.percent_used, 100)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
                  <div
                    className={cx("h-full rounded-full", usage.percent_used >= 100 ? "bg-danger" : usage.percent_used >= 80 ? "bg-warn" : "bg-ok")}
                    style={{ width: `${Math.min(usage.percent_used, 100)}%` }}
                  />
                </div>
              </div>
              <p className="mt-3 text-sm text-ink-muted">
                check_serp today: {usage.check_serp_today} of {usage.check_serp_daily_cap}
              </p>
              {usage.pacing !== "normal" ? (
                <p className="mt-2 text-sm text-warn">
                  {usage.pacing === "slowed"
                    ? `On pace to exceed this month's budget (projected $${usage.projected_usd.toFixed(2)}) - rank checks have shifted to every other day so tracking never stops.`
                    : `Projected spend ($${usage.projected_usd.toFixed(2)}) is past this month's budget - rank checks run as a weekly sweep until the period resets.`}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-ink-faint">
                Resets {new Date(usage.resets_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} UTC. Connect your own DataForSEO account on{" "}
                <Link href="/settings" className="text-ink-muted underline">
                  Settings
                </Link>{" "}
                for unmetered usage.
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink-muted">
              {usage.billed_to === "own"
                ? "Your active project uses its own connected DataForSEO account - it doesn't draw from a plan budget."
                : "Your active project has no DataForSEO connected yet, so there's nothing to meter."}
            </p>
          )}
        </section>
      ) : null}

      <p className="border-t border-line pt-6 text-[13px] text-ink-faint">
        By subscribing you agree to the{" "}
        <a className="underline underline-offset-2 hover:text-ink-muted" href="/terms">
          terms of service
        </a>
        .
      </p>
    </div>
  );
}
