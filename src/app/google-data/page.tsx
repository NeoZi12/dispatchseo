import type { Metadata } from "next";
import Link from "next/link";

// Public "how we use Google data" page - written for Google's OAuth branding
// reviewers as much as for humans. The 2026-07-22 rejection said the homepage
// does not explain the app's purpose; this page states it plainly and is
// linked from the homepage footer + FAQ. Same plain-text register as /privacy.

export const metadata: Metadata = {
  title: "How DispatchSEO uses Google data - DispatchSEO",
  description:
    "What DispatchSEO does, what it reads from Google Search Console, and what happens to that data.",
};

export default function GoogleDataPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          How DispatchSEO uses Google data
        </h1>
        <p className="text-sm text-neutral-500">
          The short version of our <Link className="underline" href="/privacy">privacy policy</Link>,
          focused on the Google Search Console connection.
        </p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">What DispatchSEO is</h2>
        <p>
          DispatchSEO is an SEO automation tool. It researches keywords for your website,
          drafts articles and interactive tools as pull requests to your site&apos;s
          repository, and tracks how your pages rank in search. You review the work from a
          dashboard and decide what gets published.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">What it reads from your Google account</h2>
        <p>
          When you connect Google, DispatchSEO requests read-only access to Google Search
          Console (the <code>webmasters.readonly</code> scope). With it, the app reads two
          things: the list of sites you have verified in Search Console, and their search
          analytics, meaning the queries people searched, plus clicks, impressions, and
          average position for your pages.
        </p>
        <p>
          The scope is read-only, so DispatchSEO cannot change, add, or delete anything in
          your Google account.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">What that data is used for</h2>
        <p>
          Two things only: recommending keywords your site can realistically rank for, and
          measuring how the content you publish actually performs. The numbers you see on the
          DispatchSEO dashboard, and the reasoning behind each article idea, come from this
          data.
        </p>
        <p>
          Google user data is never used for advertising, never sold, and never shared with
          third parties. No humans read it except with your permission, for security
          purposes, or as required by law. DispatchSEO&apos;s use of Google API data adheres
          to the{" "}
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
        <h2 className="text-lg font-medium text-white">Storage and disconnecting</h2>
        <p>
          The OAuth refresh token is stored encrypted (AES-256-GCM) and is deleted the moment
          you click Disconnect on the dashboard. Search statistics derived from the data are
          stored per site to power rank tracking and reports; the{" "}
          <Link className="underline text-white" href="/privacy">
            privacy policy
          </Link>{" "}
          explains how to have those removed too. You can also revoke DispatchSEO&apos;s
          access at any time from your{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
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
