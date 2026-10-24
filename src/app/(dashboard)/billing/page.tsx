import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { writerMode } from "../mode";
import { isCloudMode } from "@/lib/cloud";
import {
  annualBillingAvailable,
  articlesPerWeekFor,
  getSubscription,
  isActive,
  polarConfigured,
  priceLabel,
  TIER_LIMITS,
  type Tier,
} from "@/lib/billing";
import { getActiveProjectOrNull } from "@/lib/active-project";
import { platformUsageStatus } from "@/lib/dataforseo-usage";
import { db } from "@/lib/db";
import { CancelPlanButton, KeepPlanButton } from "@/components/cancel-plan";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { PageHeading } from "@/components/ui/page-heading";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { cx } from "@/components/ui/styles";

export const dynamic = "force-dynamic";

// Cloud-only plan page, built so a stranger can use it in ten seconds
// (owner, 2026-10-24): one card on top says which plan you're on and what
// happens next, with "Change plan" and "Cancel plan" right there. Below it,
// the three plans as three cards, then one link for payment method and
// invoices. Checkout and the customer portal are Polar's hosted pages;
// this page only links out. Self-host has no billing, so it bounces home.

const TIER_COPY: Record<Tier, { name: string; sub: string }> = {
  starter: { name: "Starter", sub: "One site on autopilot" },
  growth: { name: "Growth", sub: "For a small portfolio" },
  scale: { name: "Scale", sub: "For a bigger portfolio" },
};

const at = (ms: number, i = 0) => ({ "--at": `${ms}ms`, "--i": i }) as React.CSSProperties;

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const auth = await requireDashboard();
  if (!isCloudMode() || !auth.user) redirect("/dashboard");
  const { success, error } = await searchParams;
  // Which product the plan cards describe: a hosted site is sold articles a
  // week; an agent site runs on GitHub Actions, whose cost note applies.
  const hostedMode = writerMode(await getActiveProjectOrNull()) === "hosted";
  const sub = await getSubscription(auth.user.id);
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
  const activeProject = active && polarConfigured() && !hostedMode ? await getActiveProjectOrNull() : null;
  const usage = activeProject ? await platformUsageStatus(activeProject.id) : null;
  // Only for the sentence the cancel dialog writes ("new articles stop on
  // your 3 sites"). A failed count reads as one site.
  const siteCount = hasUpstreamSub
    ? ((
        await db()
          .from("projects")
          .select("id", { count: "exact", head: true })
          .eq("owner_user_id", auth.user.id)
      ).count ?? 1)
    : 0;
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

  const perWeek = sub ? articlesPerWeekFor(sub.tier) : 0;

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <PageHeading className="arrive-up" title="Billing" />

      {success ? (
        <Callout
          tone="ok"
          role="status"
          title="Payment received. Your plan is active."
          action={
            <a href="/onboarding?new=1" className={buttonClass("primary", "sm")}>
              Set up your site
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
      <section aria-labelledby="plan-title" className="arrive-up space-y-4" style={at(60)}>
        {/* Big titles above each card, like Settings: findable while scrolling. */}
        <h2 id="plan-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
          Your plan
        </h2>
        <div className="rounded-2xl border border-line-soft bg-surface p-6 sm:p-7">
        {sub && state ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
              <p className="text-[2rem] font-semibold leading-none tracking-tight text-ink">{TIER_COPY[sub.tier].name}</p>
              <StatusPill tone={state.tone}>{state.word}</StatusPill>
            </div>
            <p className="mt-3 text-[15px] text-ink">
              {hostedMode
                ? `${perWeek} ${perWeek === 1 ? "article" : "articles"} a week, up to ${sub.sites_limit} ${sub.sites_limit === 1 ? "site" : "sites"}`
                : `Up to ${sub.sites_limit} ${sub.sites_limit === 1 ? "site" : "sites"}`}
            </p>
            <p className="mt-1 text-[14px] text-ink-muted">{state.line}</p>
            <div className="mt-6 flex flex-wrap items-start gap-3">
              {sub.status === "past_due" ? (
                <a href="/api/polar/portal" className={buttonClass("primary", "md")}>
                  Update payment
                </a>
              ) : (
                <a href="#plans" className={buttonClass("secondary", "md")}>
                  Change plan
                </a>
              )}
              {sub.cancel_at_period_end ? (
                <KeepPlanButton />
              ) : (
                <CancelPlanButton endsAt={sub.current_period_end} tierName={TIER_COPY[sub.tier].name} siteCount={siteCount} />
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-[1.25rem] font-semibold tracking-tight text-ink">You don&apos;t have a plan yet</p>
            <p className="mt-2 text-[15px] text-ink-muted">Pick one below. Starter comes with a 7-day free trial; Growth and Scale start today.</p>
          </>
        )}
        </div>
      </section>

      {/* ---- the plans ---- */}
      <section id="plans" aria-labelledby="plans-title" className="arrive-up scroll-mt-24 space-y-4" style={at(140)}>
        <h2 id="plans-title" className="text-[1.4rem] font-semibold tracking-tight text-ink">
          {hasUpstreamSub ? "Change plan" : "Plans"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(TIER_COPY) as Tier[]).map((tier, i) => {
            const limits = TIER_LIMITS[tier];
            const isCurrent = active && sub?.tier === tier;
            const weekly = articlesPerWeekFor(tier);
            return (
              <div
                key={tier}
                // flex column + mt-auto on the button: the cards carry
                // different amounts of copy, and the buttons still line up.
                className={cx(
                  "arrive-up flex flex-col rounded-xl border p-5",
                  isCurrent ? "border-accent/50 bg-accent-soft" : "border-line-soft bg-surface",
                )}
                style={at(200, i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-ink">{TIER_COPY[tier].name}</h3>
                  {isCurrent ? <span className="text-[12.5px] font-medium text-accent">Your plan</span> : null}
                </div>
                <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-tight text-ink tabular-nums">
                  {priceLabel(limits.price)}
                  <span className="text-[14px] font-normal text-ink-muted"> a month</span>
                </p>
                {annualBillingAvailable() ? (
                  <p className="mt-1 text-[12.5px] text-ink-faint tabular-nums">or {priceLabel(limits.annual)} a month, billed yearly</p>
                ) : null}
                <p className="mt-4 text-[14px] text-ink">
                  {hostedMode ? (
                    <>
                      <span className="font-semibold tabular-nums">{weekly}</span> {weekly === 1 ? "article" : "articles"} a week
                    </>
                  ) : (
                    <>
                      Up to <span className="font-semibold tabular-nums">{limits.sites}</span> {limits.sites === 1 ? "site" : "sites"}
                    </>
                  )}
                </p>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {hostedMode ? `${TIER_COPY[tier].sub}, up to ${limits.sites} ${limits.sites === 1 ? "site" : "sites"}` : TIER_COPY[tier].sub}
                </p>
                {!hasUpstreamSub ? (
                  <p className={cx("mt-1 text-[12.5px] font-medium", tier === "starter" ? "text-ok" : "text-ink-faint")}>
                    {tier === "starter" ? "7-day free trial" : "Billed today"}
                  </p>
                ) : null}
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
                <div className="mt-auto pt-5">
                  {isCurrent ? (
                    <p className="flex h-9 items-center justify-center text-sm font-medium text-ink-muted">Your current plan</p>
                  ) : (
                    <a
                      // Existing subscribers change plans in Polar's portal (it
                      // prorates and REPLACES the subscription); a fresh checkout
                      // would stack a second parallel subscription. Gated on
                      // hasUpstreamSub, not `active`: a past_due subscriber
                      // sent to checkout would be billed twice.
                      href={hasUpstreamSub ? "/api/polar/portal" : `/api/polar/checkout?tier=${tier}`}
                      className={buttonClass(hasUpstreamSub ? "secondary" : "primary", "md", "w-full")}
                    >
                      {hasUpstreamSub ? `Switch to ${TIER_COPY[tier].name}` : tier === "starter" ? "Start free trial" : `Choose ${TIER_COPY[tier].name}`}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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

      <div className="arrive-up flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6 text-[13px] text-ink-faint" style={at(320)}>
        {hasUpstreamSub ? (
          <a href="/api/polar/portal" className="font-medium text-ink-muted underline decoration-line underline-offset-[3px] hover:text-ink">
            Payment method and invoices
          </a>
        ) : (
          <span />
        )}
        <span>
          By subscribing you agree to the{" "}
          <a className="underline underline-offset-2 hover:text-ink-muted" href="/terms">
            terms of service
          </a>
          .
        </span>
      </div>
    </div>
  );
}
