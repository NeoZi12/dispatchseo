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

const EFFECTIVE = "July 22, 2026";

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
          <strong className="text-neutral-100">Account data.</strong> When you create an
          account we store your email address and, if you sign in with Google, the basic
          profile Google shares for sign-in (name, email, avatar). Sign-in itself never asks
          for access to your Google data - that is a separate, optional consent described
          below. We use your email to run your account and to send service messages such as
          setup and failure alerts; we don&apos;t send marketing email without your consent,
          and we never sell it.
        </p>
        <p>
          <strong className="text-neutral-100">Billing data.</strong> Payments are handled by
          Polar as merchant of record; your card details go to Polar and its payment
          processor, never to us. We store your plan, subscription status, and Polar customer
          reference so the service knows what your account includes.
        </p>
        <p>
          <strong className="text-neutral-100">Site and integration data.</strong> To run your
          SEO we store what you connect and what the service produces: your site&apos;s domain
          and repository name, tracked keywords, rank history, generated article and tool
          records, and the tokens you provide (such as a GitHub token) - tokens are stored
          encrypted (AES-256-GCM) and deleted when you disconnect them.
        </p>
        <p>
          <strong className="text-neutral-100">Google Search Console data.</strong> If you
          connect Search Console, DispatchSEO requests read-only access (the{" "}
          <code>webmasters.readonly</code> scope). It reads your properties list and search
          analytics: queries, clicks, impressions, and average positions. It cannot modify
          anything in your Google account. Any Google OAuth refresh token is stored encrypted
          (AES-256-GCM) and is deleted immediately when you disconnect. Search statistics
          derived from this data are stored per site to power rank tracking and reporting.
        </p>
        <p>
          <strong className="text-neutral-100">Cookies.</strong> The dashboard sets
          authentication cookies to keep you signed in, and a short-lived cookie may carry
          your typed domain from signup into setup. There are no advertising cookies.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Where it lives and who processes it</h2>
        <p>
          The hosted service runs on Vercel with a Supabase (Postgres) database; email alerts
          are delivered by Resend; payments run through Polar; keyword and ranking data comes
          from DataForSEO. These providers process data only to run the service. We never sell
          your data or share it for advertising.
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
          Disconnecting an integration on the dashboard deletes its stored token immediately.
          To delete your account and everything stored with it (sites, keywords, rank history,
          search statistics), email{" "}
          <a className="text-white underline" href="mailto:support@dispatchseo.com">
            support@dispatchseo.com
          </a>{" "}
          and it will be deleted within 30 days - billing records stay with Polar as merchant
          of record where the law requires it. You can also revoke DispatchSEO&apos;s access at
          any time from your{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
          . If you joined our old pre-launch waitlist, that email is covered by the same
          request.
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
