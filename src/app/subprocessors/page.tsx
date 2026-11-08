import type { Metadata } from "next";
import Link from "next/link";

// The public subprocessor list referenced by /privacy and /dpa.
//
// WHY IT IS ITS OWN PAGE. The privacy policy used to inline the vendor list,
// which meant every vendor change was an edit to the policy - so in practice
// the list went stale and PostHog and Sentry ran for months without appearing
// on it. A separate page is cheap to keep current, is what B2B procurement
// asks for by name, and is the thing GDPR Art. 28(2) expects you to be able to
// point at when you tell a customer who else touches their data.
//
// ADDING A VENDOR THAT TOUCHES CUSTOMER DATA MEANS ADDING A ROW HERE, in the
// same change. The DPA promises 30 days' notice before a new subprocessor
// starts, so the row goes up when the decision is made, not when it ships.

export const metadata: Metadata = {
  title: "Subprocessors - DispatchSEO",
  description: "The vendors that process data on behalf of DispatchSEO, what each receives, and where it runs.",
};

const EFFECTIVE = "November 8, 2026";
const CONTACT = "privacy@dispatchseo.com";

// Confirmed against the Supabase dashboard on 2026-08-02 (Project Settings ->
// General -> Region): Central EU, Frankfurt. This is the one value on this page
// that cannot be derived from the repository - the app's compute region is
// pinned in vercel.json ("fra1"), but the database's region is not exposed on
// any public endpoint. If the project is ever migrated, this line moves with
// it; a stale region here is a misstatement in a compliance document.
const DATABASE_REGION = "Frankfurt, European Union";

type Sub = {
  name: string;
  purpose: string;
  data: string;
  location: string;
  safeguard: string;
};

const SUBPROCESSORS: Sub[] = [
  {
    name: "Vercel",
    purpose: "Hosting and delivery of the application",
    data: "Everything passing through the app in transit; request logs and IP addresses",
    location: "Application compute runs in Frankfurt, EU. Vercel Inc. is US-based.",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "Supabase",
    purpose: "Database and hosted-account authentication",
    data: "All stored account, site, keyword, ranking and Search Console data; login credentials",
    location: DATABASE_REGION,
    safeguard: "Stored in the EU. Standard Contractual Clauses cover any support access from outside it.",
  },
  {
    name: "Polar",
    purpose: "Payments, as merchant of record",
    data: "Name, email, billing and card details, purchase history. Card details go to Polar and its processor, never to us.",
    location: "United States and EU",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "Resend",
    purpose: "Transactional email (alerts, billing and account notices)",
    data: "Your email address and the content of the message sent to you",
    location: "United States",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "PostHog",
    purpose: "Product analytics and session recording",
    data: "Browser-side: page views, interactions, session recordings, and once signed in your user id and email - only with your consent. Server-side: a short record of significant account events.",
    location: "European Union",
    safeguard: "Processed in the EU",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring",
    data: "Stack traces and technical request context when something breaks. Configured not to attach IP addresses or cookies.",
    location: "United States",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "DataForSEO",
    purpose: "Keyword, ranking and SERP data",
    data: "Your domain and the keywords being researched or tracked. No personal data about you.",
    location: "United States",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "Anthropic",
    purpose: "The AI model that researches and writes articles",
    data: "Article prompts: the keyword, excerpts of the public pages read for it, your site's description and page titles, the facts you gave us, and up to 20 of your Search Console queries related to the keyword. No account, billing or login data. Anthropic's commercial terms exclude training on this data and limit retention to 30 days.",
    location: "United States",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "Cloudflare",
    purpose: "Rendering and images",
    data: "Fetches your public homepage and published pages to read your site's colours and logo and to take the previews shown on your dashboard; paints cover images from a one-line description written by our AI. No account or Search Console data.",
    location: "Global network, EU and US",
    safeguard: "Standard Contractual Clauses",
  },
  {
    name: "GitHub",
    purpose: "Delivering generated content as pull requests",
    data: "The repository you connect and the content written to it, via the access you grant",
    location: "United States",
    safeguard: "Standard Contractual Clauses",
  },
];

export default function SubprocessorsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Subprocessors</h1>
        <p className="text-sm text-neutral-500">Last updated {EFFECTIVE}</p>
      </div>

      <section className="space-y-3 text-sm leading-relaxed">
        <p>
          These are the vendors that process data on our behalf to run the hosted service at
          dispatchseo.com. Each one is bound by a data processing agreement, may only act on our
          instructions, and gets only what its job needs. This list is part of our{" "}
          <Link className="text-white underline" href="/privacy">
            privacy policy
          </Link>{" "}
          and our{" "}
          <Link className="text-white underline" href="/dpa">
            data processing agreement
          </Link>
          .
        </p>
        <p>
          Self-hosted installs use none of these. If you run DispatchSEO yourself, the vendors
          are whichever ones you choose to configure.
        </p>
      </section>

      <section className="space-y-1 text-sm leading-relaxed">
        {SUBPROCESSORS.map((s) => (
          <div key={s.name} className="space-y-1 border-t border-neutral-800 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-base font-medium text-white">{s.name}</h2>
              <span className="text-xs text-neutral-500">{s.purpose}</span>
            </div>
            <p>{s.data}</p>
            <p className="text-xs text-neutral-500">
              {s.location} &middot; {s.safeguard}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3 border-t border-neutral-800 pt-6 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">The one that is not on this list</h2>
        <p>
          Your coding agent - Claude Code, Codex, or Cursor - drafts the content, but it is{" "}
          <strong className="text-neutral-100">your</strong> subscription running under{" "}
          <strong className="text-neutral-100">your</strong> account with that provider, not a
          vendor we engage on your behalf. That relationship is directly between you and them,
          on their terms. We store the token you give us, encrypted, so the automation can use
          it; we do not send your data to them ourselves.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-medium text-white">Changes</h2>
        <p>
          We update this page when the list changes. If you have a data processing agreement
          with us, we will give you at least 30 days&apos; notice before a new subprocessor
          starts handling your data, so you have time to object. To be told about changes, or to
          object to one, email{" "}
          <a className="text-white underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
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
