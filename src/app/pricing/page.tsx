import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Caveat, DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { CardMascot } from "@/components/card-mascot";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import {
  FREE_ARTICLES_PER_MONTH,
  TIER_LIMITS,
  TIER_NAMES,
  annualBillingAvailable,
  annualCharge,
  annualSavingsPct,
  articlesPerMonthFor,
  priceLabel,
  type Tier,
} from "@/lib/billing";
import { brandJsonLdHtml } from "@/lib/brand";
import { PlanCards, sitesLine } from "../plan-cards";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";
import "../landing.css";

// The public pricing page. The landing page's #pricing section shows the same
// cards (plan-cards.tsx), but a section behind an anchor is not a page: until
// 2026-11-12 both /pricing and /plans answered a logged-out visitor with a 307
// to /login, so the one page a buyer, a search engine or an AI assistant goes
// looking for ("how much is DispatchSEO") did not exist. This one states every
// plan as cards, as a table and as plain sentences, all server-rendered.
//
// Every number comes from billing.ts. Nothing here is typed by hand, so a
// price or plan change cannot leave this page behind.
//
// Cloud only, like the landing page: a self-hosted install has no plans to
// sell. Public in src/proxy.ts under the same LANDING_ENABLED condition.

// LANDING_ENABLED and the yearly Polar products are read at request time.
export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
const TIERS: Tier[] = ["starter", "growth", "scale"];

export const metadata: Metadata = {
  title: `DispatchSEO pricing: free plan, paid plans from ${priceLabel(TIER_LIMITS.starter.price)} a month`,
  description: `DispatchSEO is free for ${FREE_ARTICLES_PER_MONTH} SEO articles a month, with no card. Paid plans cost ${priceLabel(TIER_LIMITS.starter.price)}, ${priceLabel(TIER_LIMITS.growth.price)} or ${priceLabel(TIER_LIMITS.scale.price)} a month. Every article is researched, fact-checked and published to your site for you.`,
  alternates: { canonical: "/pricing" },
};

// What one article costs on a plan at the monthly price, to the cent.
function perArticle(tier: Tier): string {
  const n = articlesPerMonthFor(tier);
  return n > 0 ? priceLabel(Math.round((TIER_LIMITS[tier].price / n) * 100) / 100) : "";
}

// "a, b and c"
function list(parts: string[]): string {
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// The questions a buyer asks about price, answered in plain sentences. Plain
// strings on purpose: the same text renders on the page and in the FAQPage
// markup, so the two can never say different things.
function pricingFaq(annual: boolean): { q: string; a: string }[] {
  const name = (t: Tier) => TIER_NAMES[t];
  const monthly = (t: Tier) => priceLabel(TIER_LIMITS[t].price);
  const yearly = (t: Tier) => priceLabel(TIER_LIMITS[t].annual);
  const maxSaving = Math.max(...TIERS.map(annualSavingsPct));
  const faq = [
    {
      q: "How much does DispatchSEO cost?",
      a:
        `DispatchSEO is free for ${FREE_ARTICLES_PER_MONTH} articles a month on one website, with no card and no end date. ` +
        `The paid plans are ${list(TIERS.map((t) => `${name(t)} at ${monthly(t)} a month for ${articlesPerMonthFor(t)} articles on ${sitesLine(TIER_LIMITS[t].sites).toLowerCase()}`))}.` +
        (annual ? ` Paying for the year brings them down to ${list(TIERS.map(yearly))} a month.` : ""),
    },
    {
      q: "Is the free plan really free?",
      a: `Yes. Your first website gets ${FREE_ARTICLES_PER_MONTH} articles a month for free, with no card and no end date. Free articles carry a small DispatchSEO badge.`,
    },
    {
      q: "What do the paid plans add?",
      a: "More articles a month, weekly keyword research, keyword rankings and advanced analytics, and no DispatchSEO badge on your articles. Growth and Scale also cover more than one website, and Scale adds priority support.",
    },
    {
      q: "How much is that per article?",
      a: `At the monthly price, an article costs ${list(TIERS.map((t) => `${perArticle(t)} on ${name(t)}`))}. That covers the keyword research, the writing, the fact-check and the publishing.`,
    },
  ];
  if (annual) {
    faq.push({
      q: "How does yearly billing work?",
      a: `You pay once for the year: ${list(TIERS.map((t) => `${priceLabel(annualCharge(t))} for ${name(t)}`))}. That works out to ${list(TIERS.map(yearly))} a month, up to ${maxSaving}% less than paying monthly.`,
    });
  }
  faq.push(
    {
      q: "Can one plan cover more than one website?",
      a: `${list(TIERS.map((t) => `${name(t)} covers ${sitesLine(TIER_LIMITS[t].sites).toLowerCase()}`))}. A plan's articles are shared between its websites. Use one site and it gets all of them. Add more and we split them for you.`,
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes. Paid plans cancel from the Billing page with no questions asked, and there's nothing to cancel on the free plan.",
    },
    {
      q: "Which websites does it work with?",
      a: "Right now DispatchSEO publishes to websites that live in a GitHub repo: Next.js, Astro, Hugo, anything you deploy from code. WordPress, Shopify, Wix, Squarespace, Webflow and Ghost aren't supported yet.",
    },
    {
      q: "Can I run it myself instead?",
      a: "Yes. DispatchSEO is open source under AGPL-3.0, and you can self-host it with your own accounts. The cloud version on this page runs everything for you.",
    },
  );
  return faq;
}

// FAQPage markup from the same strings the page shows; "<" escaped so no
// answer can ever close the script tag.
function faqJsonLdHtml(faq: { q: string; a: string }[]): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  }).replace(/</g, "\\u003c");
}

// A tick or a dash in the comparison table, with the word a screen reader (or
// a crawler reading text, where "✓" means nothing) needs.
function Mark({ on }: { on: boolean }) {
  return on ? (
    <>
      <span className="pr-yes" aria-hidden="true">✓</span>
      <span className="ld-sr">Included</span>
    </>
  ) : (
    <>
      <span className="pr-no" aria-hidden="true">–</span>
      <span className="ld-sr">Not included</span>
    </>
  );
}

export default function PricingPage() {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

  const annual = annualBillingAvailable();
  const faq = pricingFaq(annual);

  // The comparison table: one row per thing a plan gives, free plan first.
  // The perk rows are the plan cards' ticks (plan-cards.tsx) - keep in step.
  const rows: { label: string; free: ReactNode; paid: (tier: Tier) => ReactNode }[] = [
    {
      label: annual ? "Price, paid monthly" : "Price",
      free: "$0",
      paid: (t) => <>{priceLabel(TIER_LIMITS[t].price)}<small>a month</small></>,
    },
    ...(annual
      ? [
          {
            label: "Price, paid yearly",
            free: "$0",
            paid: (t: Tier) => <>{priceLabel(TIER_LIMITS[t].annual)}<small>a month, {priceLabel(annualCharge(t))} a year</small></>,
          },
        ]
      : []),
    { label: "Articles a month", free: String(FREE_ARTICLES_PER_MONTH), paid: (t) => String(articlesPerMonthFor(t)) },
    { label: "Websites", free: "1", paid: (t) => sitesLine(TIER_LIMITS[t].sites).replace(" websites", "").replace(" website", "") },
    { label: "Price per article", free: "Free", paid: (t) => perArticle(t) },
    { label: "Topics people search for", free: <Mark on />, paid: () => <Mark on /> },
    { label: "Fact-checked articles", free: <Mark on />, paid: () => <Mark on /> },
    { label: "Published for you", free: <Mark on />, paid: () => <Mark on /> },
    { label: "Your Google stats", free: <Mark on />, paid: () => <Mark on /> },
    { label: "Weekly keyword research", free: <Mark on={false} />, paid: () => <Mark on /> },
    { label: "Keyword rankings", free: <Mark on={false} />, paid: () => <Mark on /> },
    { label: "Advanced analytics", free: <Mark on={false} />, paid: () => <Mark on /> },
    { label: "No DispatchSEO badge", free: <Mark on={false} />, paid: () => <Mark on /> },
    { label: "Priority support", free: <Mark on={false} />, paid: (t) => <Mark on={t === "scale"} /> },
  ];

  return (
    <>
      <SiteNav />
      <div className={`ld ${jakarta.variable} ${dmSans.variable} ${caveat.variable}`}>
        {/* The same Organization + SoftwareApplication graph as the landing
            page (lib/brand.ts), plus this page's questions as FAQPage. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: brandJsonLdHtml() }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLdHtml(faq) }} />

        <header className="pr-hero">
          <div className="wrap">
            <h1>DispatchSEO pricing</h1>
            <p>
              Free for {FREE_ARTICLES_PER_MONTH} articles a month, with no card. Paid plans start at{" "}
              {priceLabel(TIER_LIMITS.starter.price)} a month.
            </p>
          </div>
        </header>

        <section className="pr-plans">
          <div className="wrap">
            <PlanCards annual={annual} />
          </div>
        </section>

        <section className="band-alt">
          <div className="wrap">
            <div className="sec-h">
              <h2>Compare the plans</h2>
            </div>
            <div className="pr-table-wrap">
              <table className="pr-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="ld-sr">What you get</span></th>
                    <th scope="col">Free</th>
                    {TIERS.map((t) => (
                      <th key={t} scope="col" className={t === "growth" ? "pr-pick" : undefined}>{TIER_NAMES[t]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{row.free}</td>
                      {TIERS.map((t) => (
                        <td key={t} className={t === "growth" ? "pr-pick" : undefined}>{row.paid(t)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="faq" id="faq">
          <div className="wrap">
            <div className="sec-h">
              <h2>Pricing questions</h2>
            </div>
            <div className="faq-list">
              {faq.map(({ q, a }, i) => (
                <details key={q} open={i === 0}>
                  <summary>{q}</summary>
                  <div className="a">
                    {a}
                    {q === "Can I run it myself instead?" ? <> The code is on <a href={GITHUB_URL}>GitHub</a>.</> : null}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final">
          <div className="wrap">
            <h2>Start getting found today.<span className="caret" /></h2>
            <p>{FREE_ARTICLES_PER_MONTH} articles per month, researched, fact-checked and published for you. No card.</p>
            <div className="cta-row">
              <span className="final-cta-wrap">
                <CardMascot className="cta-mascot" />
                <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
              </span>
            </div>
          </div>
        </section>

        <SiteFooter />

        <a className="discord-float" href={DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Discord support">
          <DiscordMark className="dc-mark" />
          <span className="dc-label">Discord support</span>
        </a>
      </div>
    </>
  );
}
