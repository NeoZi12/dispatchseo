import type { Metadata } from "next";
import Link from "next/link";
import { BRAND_DESCRIPTION, brandJsonLdHtml } from "@/lib/brand";
import { ARTICLES_PER_MONTH, TIER_LIMITS, priceLabel } from "@/lib/billing";

// Plain-language app description page. This URL is set as the "Application
// home page" in the Google OAuth consent screen: Google's automated branding
// checker caches its verdict per URL, so after the 2026-07-22 rejection loop
// on the root landing page, the fix (per widely-replicated community reports)
// is a fresh, never-crawled URL that states the app's purpose, its use of
// Google user data, and the app name verbatim, with a visible privacy-policy
// link in the body. Keep all of that intact if editing.

export const metadata: Metadata = {
  title: "About DispatchSEO",
  description:
    "What DispatchSEO is, what it costs, and how it uses Google Search Console data. A free SEO autopilot: researched, fact-checked articles published to your site for you.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: brandJsonLdHtml() }} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">DispatchSEO</h1>
        <p className="text-sm text-neutral-500">
          What this application is and how it works. See also the{" "}
          <Link className="underline" href="/privacy">
            privacy policy
          </Link>{" "}
          and{" "}
          <Link className="underline" href="/google-data">
            how DispatchSEO uses Google data
          </Link>
          .
        </p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">What DispatchSEO does</h2>
        <p>{BRAND_DESCRIPTION}</p>
        <p>How it works, step by step:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Keyword research from real search demand, and from your Google Search Console
            data once you connect it, so every article targets a topic people actually look for
          </li>
          <li>
            Articles written and fact-checked for you, then published to your site: as a pull
            request to your GitHub repository, or on a hosted blog if your site has no repo
          </li>
          <li>Google clicks and impressions per article, so you can see what each one brought</li>
          <li>Keyword rank tracking and weekly research on the paid plans</li>
          <li>Scheduled automation with failure alerts, and a dashboard that shows all of it</li>
        </ul>
        <h3 className="pt-2 text-base font-medium text-white">What it costs</h3>
        <p>
          Free: 2 articles per month, no card, no end date; free articles carry a small
          DispatchSEO badge. Starter: {ARTICLES_PER_MONTH.starter} articles per month on 1 website for{" "}
          {priceLabel(TIER_LIMITS.starter.price)}. Growth: {ARTICLES_PER_MONTH.growth} articles per month on up to{" "}
          {TIER_LIMITS.growth.sites} websites for {priceLabel(TIER_LIMITS.growth.price)}. Scale: {ARTICLES_PER_MONTH.scale} articles
          per month on up to {TIER_LIMITS.scale.sites} websites for {priceLabel(TIER_LIMITS.scale.price)}. Paid plans add
          weekly keyword research, keyword rankings and advanced analytics, and drop the badge.
          Yearly billing is cheaper where offered; the exact figures are on the{" "}
          <Link className="underline text-white" href="/?home=1#pricing">
            pricing section
          </Link>
          .
        </p>
        <p>
          Sites that live in a GitHub repository, including Next.js, Astro and other code-built
          sites, and sites on self-hosted WordPress are supported today. Hosted site builders
          (Wix, Squarespace, Shopify, Webflow) are not yet.
        </p>
        <p>
          The software is open source (AGPL-3.0) and can be self-hosted, where it also exposes an
          MCP server so a coding agent such as Claude Code, Codex or Cursor can drive it. The
          hosted service lives at{" "}
          <Link className="underline text-white" href="/">
            dispatchseo.com
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">
          Why DispatchSEO requests access to your Google data
        </h2>
        <p>
          If you choose to connect your Google account, DispatchSEO requests read-only
          access to your Google Search Console data (the <code>webmasters.readonly</code>{" "}
          scope). It reads the list of sites you have verified and their search analytics:
          the queries people searched, plus clicks, impressions, and average position for
          your pages.
        </p>
        <p>
          This data is used for exactly two things: recommending keywords your site can
          realistically win, and measuring how the content you publish performs in Google
          Search. The read-only scope means DispatchSEO cannot change, add, or delete
          anything in your Google account. Google user data is never used for advertising,
          never sold, and never shared with third parties.
        </p>
        <p>
          DispatchSEO&apos;s use and transfer to any other app of information received from
          Google APIs will adhere to the{" "}
          <a
            className="text-white underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Your data, your control</h2>
        <p>
          The OAuth refresh token is stored encrypted (AES-256-GCM) and is deleted when you
          disconnect Google from the dashboard. You can also revoke DispatchSEO&apos;s
          access at any time from your{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
          . Full details, including how to have stored statistics removed, are in the{" "}
          <Link className="underline text-white" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </section>

      <p className="text-sm text-neutral-500">
        <Link className="underline" href="/">
          Back to dispatchseo.com
        </Link>
      </p>
    </main>
  );
}
