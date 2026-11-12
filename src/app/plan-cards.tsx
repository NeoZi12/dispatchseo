import { CardMascot } from "@/components/card-mascot";
import {
  TIER_LIMITS,
  TIER_NAMES,
  annualSavingsPct,
  articlesPerMonthFor,
  priceLabel,
  type Tier,
} from "@/lib/billing";
import { PricingSwitch } from "./pricing-switch";

// The plan cards, shared by the landing page's #pricing section and the public
// /pricing page so the two can never show different plans. Server-rendered:
// both prices sit in the HTML and PricingSwitch only flips which one shows.
// Needs the .ld root (landing.css) around it.

// Desktop plan card price. When the yearly products exist the card carries
// BOTH prices and the PricingSwitch above the cards decides which one shows
// (.pr-month / .pr-year, CSS-toggled by a data attribute - the cards stay
// server-rendered). Yearly shows the per-month figure; the yearly total is
// stated on /plans and at checkout, not on the card (Neo's call, 2026-08-21).
// Without yearly products the card shows the monthly price alone.
function PlanPrice({ tier, annual }: { tier: Tier; annual: boolean }) {
  if (!annual) {
    return (
      <div className="p-price">
        {priceLabel(TIER_LIMITS[tier].price)}
        <small>/mo</small>
      </div>
    );
  }
  return (
    <>
      <div className="p-price pr-year">
        {priceLabel(TIER_LIMITS[tier].annual)}
        <small>/mo</small>
      </div>
      <div className="p-price pr-month">
        {priceLabel(TIER_LIMITS[tier].price)}
        <small>/mo</small>
      </div>
    </>
  );
}

// A plan's "Choose" button: setup with the plan (and, when yearly exists,
// the period the switch shows - both links render, the same CSS toggle as
// the prices hides one). Setup sends a paid pick to checkout after sign-in.
function PlanLink({ tier, annual, children }: { tier: Tier; annual: boolean; children: React.ReactNode }) {
  const href = (interval: "month" | "year") => `/onboarding?plan=${tier}&interval=${interval}`;
  if (!annual) return <a className="btn btn-solid" href={href("month")}>{children}</a>;
  return (
    <>
      <a className="btn btn-solid pr-year" href={href("year")}>{children}</a>
      <a className="btn btn-solid pr-month" href={href("month")}>{children}</a>
    </>
  );
}

// "1 website" / "Up to 3 websites": a plan's site allowance as every plan card
// states it (owner, 2026-11-11). An owner may use fewer sites than the plan
// covers, which is why the paid rows read "Up to N".
export function sitesLine(sites: number): string {
  return sites === 1 ? "1 website" : `Up to ${sites} websites`;
}

// The mobile pricing cards' paid plans. Articles a month and sites come from
// billing.ts (ARTICLES_PER_MONTH, TIER_LIMITS), so a plan change can't leave
// these behind.
const PM_PAID: { tier: Tier; perMonth: number; tagline: string; ticks: string[]; pick: boolean }[] = [
  {
    tier: "starter", perMonth: articlesPerMonthFor("starter"), pick: false,
    tagline: "Steady start, monthly articles",
    ticks: ["Weekly keyword research", "Fact-checked articles", "Keyword rankings", "Advanced analytics", "No DispatchSEO badge"],
  },
  {
    tier: "growth", perMonth: articlesPerMonthFor("growth"), pick: true,
    tagline: "Serious about traffic",
    ticks: ["Weekly keyword research", "Fact-checked articles", "Keyword rankings", "Advanced analytics", "No DispatchSEO badge"],
  },
  {
    tier: "scale", perMonth: articlesPerMonthFor("scale"), pick: false,
    tagline: "All in on content",
    ticks: ["Weekly keyword research", "Fact-checked articles", "Keyword rankings", "Advanced analytics", "No DispatchSEO badge", "Priority support"],
  },
];

// The same price, sized for a phone card.
function PmPrice({ tier, annual }: { tier: Tier; annual: boolean }) {
  if (!annual) {
    return (
      <span className="pm-price">
        {priceLabel(TIER_LIMITS[tier].price)}
        <small>/mo</small>
      </span>
    );
  }
  return (
    <>
      <span className="pm-price pr-year">
        {priceLabel(TIER_LIMITS[tier].annual)}
        <small>/mo</small>
      </span>
      <span className="pm-price pr-month">
        {priceLabel(TIER_LIMITS[tier].price)}
        <small>/mo</small>
      </span>
    </>
  );
}

export function PlanCards({ annual }: { annual: boolean }) {
  return (
    <>
    {/* Prices come from TIER_LIMITS (billing.ts); the ticks follow the
        free/paid split decided 2026-11-06/08: free keeps the result
        (articles + its Google numbers), paid adds the pace, weekly
        research, rankings, advanced analytics and drops the badge.
        Paid counts are stated flat and per month (5 / 15 / 30 a month,
        owner 2026-11-11), never "up to" (owner, 2026-11-08: people get
        what they pay for); the second row is the plan's websites. Same perks as the dashboard's upgrade panel - keep the
        two in step. Yearly is the default once the yearly Polar
        products exist; the tag says "up to" because the saving differs
        per tier. */}
    <PricingSwitch savingsPct={Math.max(annualSavingsPct("starter"), annualSavingsPct("growth"), annualSavingsPct("scale"))} enabled={annual}>
    <div className="plans plans-4">
      <div className="plan">
        <h3>Free</h3>
        <div className="p-price">$0<small>/forever</small></div>
        <div className="p-sub">Try it on a side project</div>
        <ul>
          <li>2 articles a month</li>
          <li>Topics people search for</li>
          <li>Fact-checked articles</li>
          <li>Published for you</li>
          <li>Your Google stats</li>
        </ul>
        <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
      </div>
      <div className="plan">
        <h3>Starter</h3>
        <PlanPrice tier="starter" annual={annual} />
        <div className="p-sub">Steady start, monthly articles</div>
        <ul>
          <li>{articlesPerMonthFor("starter")} articles a month</li>
          <li>{sitesLine(TIER_LIMITS.starter.sites)}</li>
          <li>Weekly keyword research</li>
          <li>Fact-checked articles</li>
          <li>Keyword rankings</li>
          <li>Advanced analytics</li>
          <li>No DispatchSEO badge</li>
        </ul>
        <PlanLink tier="starter" annual={annual}>Choose Starter</PlanLink>
      </div>
      <div className="plan hero-plan">
        <span className="p-badge">Most popular</span>
        {/* The hero's mascot, sitting on this card's top edge. */}
        <CardMascot className="plan-mascot" />
        <h3>Growth</h3>
        <PlanPrice tier="growth" annual={annual} />
        <div className="p-sub">Serious about traffic</div>
        <ul>
          <li>{articlesPerMonthFor("growth")} articles a month</li>
          <li>{sitesLine(TIER_LIMITS.growth.sites)}</li>
          <li>Weekly keyword research</li>
          <li>Fact-checked articles</li>
          <li>Keyword rankings</li>
          <li>Advanced analytics</li>
          <li>No DispatchSEO badge</li>
        </ul>
        <PlanLink tier="growth" annual={annual}>Choose Growth</PlanLink>
      </div>
      <div className="plan">
        <h3>Scale</h3>
        <PlanPrice tier="scale" annual={annual} />
        <div className="p-sub">All in on content</div>
        <ul>
          <li>{articlesPerMonthFor("scale")} articles a month</li>
          <li>{sitesLine(TIER_LIMITS.scale.sites)}</li>
          <li>Weekly keyword research</li>
          <li>Fact-checked articles</li>
          <li>Keyword rankings</li>
          <li>Advanced analytics</li>
          <li>No DispatchSEO badge</li>
          <li>Priority support</li>
        </ul>
        <PlanLink tier="scale" annual={annual}>Choose Scale</PlanLink>
      </div>
    </div>
    {/* Mobile pricing (<=980px): one stacked card per plan, in the shape
        the owner picked 2026-11-09 (Postiz's pricing page as the model,
        in our theme): name top-left and the "Most popular" pill
        top-right, the price big with the tagline under it, a rule, then
        every tick as a filled check-circle with the articles a month as
        the first row, and the button last. Growth is a solid violet
        card. Same ticks as the desktop card above - keep them in step. */}
    <div className="plans-m">
      <div className="pm-list">
        <div className="pm-card">
          <div className="pm-head">
            <span className="pm-name">Free</span>
          </div>
          <span className="pm-price">$0<small>/forever</small></span>
          <span className="pm-tag">Try it on a side project</span>
          <ul className="pm-ticks">
            <li><b>2 articles a month</b></li>
            <li>Topics people search for</li>
            <li>Fact-checked articles</li>
            <li>Published for you</li>
            <li>Your Google stats</li>
          </ul>
          <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
        </div>
        {PM_PAID.map((plan) => (
          <div key={plan.tier} className={`pm-card${plan.pick ? " pm-pick" : ""}`}>
            {plan.pick ? <CardMascot className="pm-mascot" /> : null}
            <div className="pm-head">
              <span className="pm-name">{TIER_NAMES[plan.tier]}</span>
              {plan.pick ? <span className="pm-flag">Most popular</span> : null}
            </div>
            <PmPrice tier={plan.tier} annual={annual} />
            <span className="pm-tag">{plan.tagline}</span>
            <ul className="pm-ticks">
              <li><b>{plan.perMonth} articles a month</b></li>
              <li>{sitesLine(TIER_LIMITS[plan.tier].sites)}</li>
              {plan.ticks.map((t) => <li key={t}>{t}</li>)}
            </ul>
            <PlanLink tier={plan.tier} annual={annual}>Choose {TIER_NAMES[plan.tier]}</PlanLink>
          </div>
        ))}
      </div>
    </div>
    </PricingSwitch>
    {/* How a multi-site plan's articles reach its sites, under every
        plan surface in the same line (landing, /plans, billing). */}
    <div className="plans-note">
      <p>Use one site and it gets all of them. Add more and we split them for you.</p>
    </div>
    </>
  );
}
