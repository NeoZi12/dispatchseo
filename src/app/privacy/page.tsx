import type { Metadata } from "next";
import Link from "next/link";

// Public privacy policy - required by the Google OAuth consent screen and
// linked from the homepage (launch plan step 3). Served outside the login
// gate via the proxy allowlist. Plain text on purpose; this page is read by
// Google's verification reviewers as much as by humans.

export const metadata: Metadata = {
  title: "Privacy policy - DispatchSEO",
  description: "What data DispatchSEO collects, how it is used, and how to remove it.",
};

const EFFECTIVE = "July 17, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy policy</h1>
        <p className="text-sm text-neutral-500">Effective {EFFECTIVE}</p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">What DispatchSEO is</h2>
        <p>
          DispatchSEO is an open-source SEO manager. You can self-host it, in which case your
          data lives entirely in your own accounts (your Vercel deployment, your Supabase
          database, your Google Cloud project) and this policy applies only in the sense that
          the software behaves as described below. This policy primarily covers the hosted
          service at dispatchseo.com, operated by the DispatchSEO maintainer.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Data we collect</h2>
        <p>
          <strong className="text-neutral-100">Waitlist email.</strong> If you join the cloud
          waitlist we store the email address you submit, and use it only to contact you about
          the DispatchSEO cloud launch. It is never sold or shared.
        </p>
        <p>
          <strong className="text-neutral-100">Google Search Console data.</strong> If you
          connect your Google account, DispatchSEO requests read-only access to your Search
          Console data (the <code>webmasters.readonly</code> scope). It reads your properties
          list and search analytics: queries, clicks, impressions, and average positions. It
          cannot modify anything in your Google account. The OAuth refresh token is stored
          encrypted (AES-256-GCM) and is deleted immediately when you click Disconnect. Search
          statistics derived from this data are stored per site to power rank tracking and
          reporting.
        </p>
        <p>
          <strong className="text-neutral-100">Login cookie.</strong> The dashboard sets one
          authentication cookie after password login. There are no advertising or analytics
          cookies on the dashboard.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Google API Services disclosure</h2>
        <p>
          DispatchSEO&apos;s use and transfer of information received from Google APIs adheres
          to the{" "}
          <a
            className="text-white underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. Google user data is used only to provide
          the features described above, is never used for advertising, and is never sold. No
          humans read it except with your permission, for security purposes, or as required by
          law.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Deleting your data</h2>
        <p>
          Disconnecting Google on the dashboard deletes the stored OAuth token. To remove
          everything else (waitlist entry, stored search statistics), open an issue at{" "}
          <a className="text-white underline" href="https://github.com/NeoZi12/dispatchseo/issues">
            github.com/NeoZi12/dispatchseo
          </a>{" "}
          or email the maintainer, and it will be deleted within 30 days. You can also revoke
          DispatchSEO&apos;s access at any time from your{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
          .
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Changes</h2>
        <p>
          Changes to this policy are published on this page with an updated effective date. The
          policy&apos;s history is visible in the public repository.
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
