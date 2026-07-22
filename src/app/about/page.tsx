import type { Metadata } from "next";
import Link from "next/link";

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
    "What DispatchSEO is, what it does, and how it uses Google Search Console data.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
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
        <p>
          DispatchSEO is an SEO automation tool for websites that live in a git repository.
          It researches keywords your site can rank for, drafts articles and interactive
          tools as pull requests to your repository, tracks how your pages rank in search
          over time, and shows all of it on one dashboard. You review each idea and each
          draft, and you decide what gets published; an optional automatic mode publishes on
          a schedule with pull requests as the audit trail.
        </p>
        <p>Its main features:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Keyword research based on your product and your search performance data</li>
          <li>Article and tool drafts delivered as pull requests to your site&apos;s repository</li>
          <li>Rank tracking for the keywords you care about</li>
          <li>A review queue where you approve or reject every suggestion</li>
          <li>Scheduled automation with failure alerts</li>
        </ul>
        <p>
          The software is open source (AGPL-3.0) and can be self-hosted. The hosted service
          lives at{" "}
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
