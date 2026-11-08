import type { Metadata } from "next";
import Link from "next/link";

// Public privacy policy - required by the Google OAuth consent screen and
// linked from the homepage. Served outside the login gate via the proxy
// allowlist. Plain text on purpose; this page is read by Google's verification
// reviewers as much as by humans.
//
// STRUCTURE IS LOAD-BEARING. This document is written to satisfy, in one pass:
//   - GDPR Art. 13 (the full mandatory-disclosure checklist: controller
//     identity, purposes AND legal basis, recipients, transfers, retention,
//     the complete rights list, whether provision is required, automated
//     decision-making). Missing any one of those is the finding a regulator
//     writes up first.
//   - Israeli Privacy Protection Law s.11 as amended by Amendment 13 (in force
//     2025-08-14): voluntary-vs-required, purpose, controller identity,
//     recipients, and the s.13-14 review/correct rights.
//   - Google API Services User Data Policy, incl. the verbatim Limited Use
//     sentence Google's reviewers grep for.
//
// EVERY FACTUAL CLAIM HERE WAS VERIFIED AGAINST THE CODE on 2026-08-02, and the
// Google passages again on 2026-11-08 (the write and site-verification scopes,
// the writer's use of Search Console queries, the AI provider, revocation). If you
// change what the product collects, sends, or deletes, this page is part of
// that change - an inaccurate privacy policy is worse than a thin one, because
// it converts an engineering detail into a misrepresentation.

export const metadata: Metadata = {
  title: "Privacy policy - DispatchSEO",
  description: "What data DispatchSEO collects, how it is used, and how to remove it.",
};

const EFFECTIVE = "November 8, 2026";
const CONTACT = "privacy@dispatchseo.com";

// The controller's identity is mandatory under GDPR Art. 13(1)(a) and Israeli
// PPL s.11(3). "The DispatchSEO maintainer" is not an identity - use the
// operator's full legal name exactly as it would appear on a contract.
const OPERATOR = "Neo Zino";

// GDPR Art. 27 / UK GDPR Art. 27 representative. The "occasional processing"
// exemption does not cover an ongoing subscription service, so an EU-facing
// SaaS needs one appointed. Set these once a representative is engaged and the
// section below starts rendering; leaving them null is honest (no claim is
// made) but the obligation is still outstanding.
const EU_REPRESENTATIVE: { name: string; address: string; email: string } | null = null;
const UK_REPRESENTATIVE: { name: string; address: string; email: string } | null = null;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-sm leading-relaxed">
      <h2 className="text-lg font-medium text-white">{title}</h2>
      {children}
    </section>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="text-neutral-100">{children}</strong>;
}

// One row of the cookie / processor tables. Kept as a plain grid rather than a
// <table> so it stays readable on a phone without horizontal scroll.
function Row({ name, purpose, detail }: { name: string; purpose: string; detail: string }) {
  return (
    <div className="grid gap-1 border-t border-neutral-800 py-3 sm:grid-cols-[10rem_1fr]">
      <div className="font-mono text-xs text-neutral-100">{name}</div>
      <div className="space-y-1">
        <div>{purpose}</div>
        <div className="text-xs text-neutral-500">{detail}</div>
      </div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-8 px-6 py-16 text-neutral-300">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy policy</h1>
        <p className="text-sm text-neutral-500">Effective {EFFECTIVE}</p>
      </div>

      <Section title="Who we are and what this covers">
        <p>
          DispatchSEO is an SEO tool that researches keywords for your website, drafts articles
          and interactive tools as pull requests to your repository, and tracks how your pages
          rank in search.
        </p>
        <p>
          The hosted service at dispatchseo.com is operated by <Term>{OPERATOR}</Term>, an
          individual based in Israel, who is the <Term>data controller</Term> for the personal
          data described below. You can reach us about anything on this page at{" "}
          <a className="text-white underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
        <p>
          DispatchSEO is also open source (AGPL-3.0) and can be self-hosted. If you run it
          yourself, your data lives entirely in your own accounts - your own hosting, your own
          database, your own Google Cloud project - and we are not the controller of it. The
          only thing a self-hosted install sends us is the install count described below. This
          policy otherwise covers the hosted service.
        </p>
      </Section>

      {(EU_REPRESENTATIVE || UK_REPRESENTATIVE) && (
        <Section title="Our representatives in the EU and UK">
          {EU_REPRESENTATIVE && (
            <p>
              Our representative in the European Union under Article 27 GDPR is{" "}
              <Term>{EU_REPRESENTATIVE.name}</Term>, {EU_REPRESENTATIVE.address} (
              <a className="text-white underline" href={`mailto:${EU_REPRESENTATIVE.email}`}>
                {EU_REPRESENTATIVE.email}
              </a>
              ). You may contact them instead of us on any matter relating to your personal
              data.
            </p>
          )}
          {UK_REPRESENTATIVE && (
            <p>
              Our representative in the United Kingdom under Article 27 UK GDPR is{" "}
              <Term>{UK_REPRESENTATIVE.name}</Term>, {UK_REPRESENTATIVE.address} (
              <a className="text-white underline" href={`mailto:${UK_REPRESENTATIVE.email}`}>
                {UK_REPRESENTATIVE.email}
              </a>
              ).
            </p>
          )}
        </Section>
      )}

      <Section title="How DispatchSEO uses Google user data (Google API Services disclosure)">
        <p>
          This section describes how DispatchSEO accesses, uses, stores and shares Google user
          data from Google Search Console, who we share it with, how long we keep it, and how
          you can delete it or revoke our access. It applies to every Google account connected to
          the hosted service at dispatchseo.com.
        </p>
        <p>
          DispatchSEO&apos;s use and transfer to any other app of information received from
          Google APIs adheres to the{" "}
          <a
            className="text-white underline"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
        <p>
          <Term>What we request.</Term> Three scopes, each on Google&apos;s consent screen:{" "}
          <code>webmasters.readonly</code> to read Search Console, <code>webmasters</code> to
          add your site as a property and submit your sitemap, and <code>siteverification</code>{" "}
          to verify your domain during setup. The previous paragraph on Search Console data lists
          exactly what we read and the three things we write.
        </p>
        <p>
          <Term>What we use it for.</Term> Google user data powers four features you can see.
          The clicks, impressions and queries appear on your dashboard and on each article&apos;s
          page. Topic selection treats a query your site already appears for, without a page in
          the top ten, as demand for an article. The writer&apos;s research includes up to 20 of
          your own queries related to the keyword, so the article answers what people already
          search for on your site. Publishing pace slows down, and pauses, when Google is not
          indexing your articles. The write permissions exist so Google finds your new articles
          without you opening Search Console: we submit the sitemap and verify the domain for
          you.
        </p>
        <p>
          <Term>Who else processes it.</Term> The query lists used in research travel inside
          the article prompt to Anthropic, our AI model provider, together with the keyword and
          the public pages read for the article. Anthropic processes these prompts under its
          commercial terms, which exclude training on customer data and limit retention to 30
          days. Everything else stays in our database at Supabase in the EU. No other vendor
          receives Google user data. We never use it for advertising, never sell it or pass it
          to data brokers, and never use it to train general-purpose AI models. No human at
          DispatchSEO reads it except with your permission, for security purposes, or where the
          law requires it.
        </p>
        <p>
          <Term>How long we keep it, and how to stop.</Term> We keep a site&apos;s Search
          Console statistics while the site is connected and delete them when you delete the
          site or your account. The query lists used for an article stay with that
          article&apos;s run record for the same period. You can withdraw access at any time:
          disconnect Google on the dashboard&apos;s Google page, or remove DispatchSEO at{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            myaccount.google.com/permissions
          </a>
          . Either way we delete the refresh token and revoke it at Google; the articles already
          on your site stay yours. If we ever change how we use Google user data, we will ask
          for your consent again before the new use begins.
        </p>
      </Section>

      <Section title="What we collect, why, and on what legal basis">
        <p>
          Providing this data is voluntary, but most of it is necessary to give you the
          service: without an email address we cannot create your account, and without a
          connected site we have nothing to work on. Where a field is optional, not providing
          it simply means the related feature does not run.
        </p>

        <p>
          <Term>Account data.</Term> Your email address and, if you sign in with Google, the
          basic profile Google shares for sign-in (name, email, avatar). Signing in never
          asks for access to your Google data - that is a separate, optional consent described
          further down. We use this to run your account and to send service messages such as
          setup and failure alerts. <Term>Legal basis:</Term> performance of our contract with
          you.
        </p>

        <p>
          <Term>Billing data.</Term> Payments are handled by Polar as merchant of record. Your
          card details go to Polar and its payment processor and never reach us. We store your
          plan, subscription status, and Polar customer reference so the service knows what
          your account includes. <Term>Legal basis:</Term> performance of our contract, and our
          legal obligation to keep tax and accounting records.
        </p>

        <p>
          <Term>Site and integration data.</Term> What you connect and what the service
          produces: your site&apos;s domain and repository name, tracked keywords, rank history,
          generated article and tool records, backlink prospects, and the credentials you
          provide - a GitHub token, DataForSEO or SerpApi credentials, a coding-agent token.
          Credentials are encrypted at rest with AES-256-GCM. <Term>Legal basis:</Term>{" "}
          performance of our contract with you.
        </p>

        <p>
          <Term>Google Search Console data.</Term> If you connect Google, DispatchSEO asks for
          three permissions on Google&apos;s consent screen: read access to Search Console (the{" "}
          <code>webmasters.readonly</code> scope), read and write access to Search Console (
          <code>webmasters</code>), and Site Verification (<code>siteverification</code>). We
          read your list of properties and, for the site you connect, the daily search totals
          (clicks, impressions, click-through rate, average position), the top 20 queries and
          top 20 pages for each day, the index status of the articles we published, and when
          Google last read your sitemap. We write three things and nothing else: we add your
          site as a Search Console property when it is missing, we place a verification token
          for your domain and confirm it, and we submit your blog&apos;s sitemap address. We
          never change other properties, never request indexing, and never read other Google
          services. The OAuth refresh token is encrypted at rest (AES-256-GCM); when you
          disconnect, we delete it and revoke it at Google. <Term>Legal basis:</Term> your
          consent, given on Google&apos;s consent screen, which you can withdraw at any time by
          disconnecting.
        </p>

        <p>
          <Term>Feedback you submit.</Term> If you post on the feedback board we store the
          title and body you wrote, your vote records, and your email address so we can reply.
          Your email is never displayed on the board. <Term>Legal basis:</Term> our legitimate
          interest in running a support and product-feedback channel.
        </p>

        <p>
          <Term>Security and anti-abuse data.</Term> We store the IP address of failed login
          attempts and of waitlist signups, with a counter, to rate-limit brute-force and spam
          attempts. Failed-login records are deleted when you next sign in successfully.{" "}
          <Term>Legal basis:</Term> our legitimate interest in keeping accounts secure, and our
          obligation under GDPR Art. 32 to secure the service.
        </p>

        <p>
          <Term>Product analytics and error reports.</Term> We use PostHog to understand how the
          product is used and Sentry to be told when it breaks. What these collect, and how to
          say no, is set out under Cookies and analytics below.
        </p>

        <p>
          <Term>Self-hosted install count.</Term> If you run DispatchSEO yourself, your install
          sends us two things once a day: a random identifier generated on your own machine at
          first boot, and the version you are running. That is the whole payload - no domain,
          no email, no keywords, no site or Search Console data, no credentials, and the
          identifier is not derived from any of them. As with any HTTP request, the connecting
          IP address is visible to us and to our host in transit; we do not store it against
          the install record. It exists so we can tell how many installs are actually running,
          which download counts cannot answer. Turn it off by setting{" "}
          <code>DISPATCHSEO_TELEMETRY=off</code> in your <code>.env</code>; nothing else about
          the software changes when you do. <Term>Legal basis:</Term> our legitimate interest in
          knowing the size of the user base, balanced against a payload deliberately built to
          identify nobody.
        </p>

        <p>
          We do not make any decision that produces a legal or similarly significant effect
          about you by automated means, and we do not profile you. We do not sell your personal
          data, and we do not share it for advertising or cross-context behavioural
          advertising.
        </p>
      </Section>

      <Section title="Cookies and analytics">
        <p>These are the cookies and browser-storage keys the hosted service uses:</p>
        <div className="text-sm">
          <Row
            name="dash_auth"
            purpose="Keeps you signed in on a self-hosted install."
            detail="Strictly necessary. 30 days. httpOnly, sameSite=lax."
          />
          <Row
            name="sb-*-auth-token"
            purpose="Keeps you signed in on the hosted service (Supabase Auth)."
            detail="Strictly necessary. Session, rotated as you browse."
          />
          <Row
            name="dash_project"
            purpose="Remembers which of your sites the dashboard is showing."
            detail="Strictly necessary. 1 year. httpOnly, sameSite=lax."
          />
          <Row
            name="pending_domain"
            purpose="Carries the domain you typed at signup into the setup wizard."
            detail="Strictly necessary. 7 days. httpOnly, sameSite=lax."
          />
          <Row
            name="ds_repo_cleanup"
            purpose="Shows the leftover-repository notice once, then clears itself."
            detail="Strictly necessary. 1 day. Readable by the page's own scripts."
          />
          <Row
            name="whats-new"
            purpose="Remembers that you have seen the current release notes."
            detail="Strictly necessary. 1 year. httpOnly, sameSite=lax."
          />
          <Row
            name="ph_* "
            purpose="PostHog product analytics: a random identifier for your browser."
            detail="Not strictly necessary - see below. Up to 1 year, in cookies and localStorage."
          />
        </div>
        <p>
          There are no advertising cookies, no ad-network pixels, and no cross-site tracking.
        </p>
        <p>
          <Term>PostHog.</Term> In your browser, PostHog records page views, clicks and other
          interactions in the product, and session recordings of dashboard use. Once you are
          signed in we associate that record with your user id and email so we can tell which
          account hit a problem. <Term>Legal basis:</Term> your consent. We ask on your first
          visit, and until you accept, PostHog does not load at all - no cookie, no recording,
          nothing read from your device. Declining changes nothing else about the product, and
          you can change your mind by clearing this site&apos;s data in your browser.
        </p>
        <p>
          Separately, our servers send PostHog a short record of a few significant events -
          an account created, a checkout opened, a site added or deleted - so we can tell
          whether the product is working. These are sent from our side, store nothing on your
          device and read nothing from it, and happen whether or not you accepted the cookies
          above. <Term>Legal basis:</Term> our legitimate interest in understanding whether the
          service functions, balanced against a record that is a handful of events per account
          rather than a picture of your behaviour. You can object to this at {CONTACT}.
        </p>
        <p>
          <Term>Sentry.</Term> When something errors we send Sentry a stack trace and the
          technical context of the request - the route, the browser, the error itself. Sentry
          is configured not to attach IP addresses or cookies to those reports, and we do not
          record sessions with it. <Term>Legal basis:</Term> our legitimate interest in finding
          out that the product is broken before you have to tell us.
        </p>
        <p>
          <Term>Vercel Analytics</Term> counts page views and referrers for the marketing site.
          It sets no cookie and builds no profile.
        </p>
        <p>
          <Term>Our own visit count.</Term> Our servers keep a log of page requests: the path,
          the referring site, the browser&apos;s user-agent string, the country, and a visitor
          number that is a hash of the network address and browser. The hash is salted with a
          secret held only on our server and rotated every UTC day, so it cannot be linked
          from one day to the next or turned back into an address. The address itself is not
          stored. It sets no cookie and reads nothing from your device. <Term>Legal basis:</Term>{" "}
          our legitimate interest in knowing whether the site is reached, and by people or by
          crawlers. You can object to this at {CONTACT}.
        </p>
      </Section>

      <Section title="Who else processes your data">
        <p>
          We use a small set of vendors to run the service. Each one processes data only on our
          instructions and only to provide its part of the service, under a data-processing
          agreement. The current list, with what each receives and where it runs, is on our{" "}
          <Link className="text-white underline" href="/subprocessors">
            subprocessors page
          </Link>
          , which we keep up to date as it changes.
        </p>
        <p>
          We never sell your data, never share it for advertising, and never give it to anyone
          else except where this policy says so or where the law requires it - for example a
          binding court order, which we will tell you about unless we are forbidden from doing
          so.
        </p>
      </Section>

      <Section title="Where your data lives and international transfers">
        <p>
          Both the application and the database that holds your data run in Frankfurt, in the
          European Union. We are established in Israel, which the European Commission
          recognises as providing an adequate level of data protection, so transfers from the
          EEA to us do not need any additional safeguard.
        </p>
        <p>
          Some of our vendors are based in the United States. Where personal data reaches them,
          the transfer is covered by the European Commission&apos;s Standard Contractual
          Clauses, by the vendor&apos;s certification under the EU-US Data Privacy Framework, or
          by another mechanism permitted under Chapter V of the GDPR. The{" "}
          <Link className="text-white underline" href="/subprocessors">
            subprocessors page
          </Link>{" "}
          names the location and safeguard for each one. You can ask us for a copy of the
          relevant safeguard at {CONTACT}.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          <Term>While your account is open:</Term> we keep your account data, your site data,
          and your rank and search history for as long as you have an account, because the
          history is the product - a rank chart with the old points deleted is not a rank
          chart.
        </p>
        <p>
          <Term>When you delete your account:</Term> your projects and everything attached to
          them - keywords, rank history, search statistics, pages, suggestions, backlink
          prospects, site profile - are deleted immediately, and your login is deleted with
          them. So are the visit records, product-usage events and sign-in activity tied to
          your account.
        </p>
        <p>
          <Term>What outlives that:</Term> billing and tax records, which Polar retains as
          merchant of record for the period its own legal obligations require; and backups,
          which roll off on their own cycle within 30 days. Feedback-board posts stay on the
          board, detached from any account: the email and account id on them are removed. If
          a site used the free plan, the free plan&apos;s abuse ledger keeps salted one-way
          hashes of the site&apos;s domain, your email, your GitHub login, your network address
          and your device cookie for as long as the free plan exists, so the same site cannot
          claim it twice. Without our server&apos;s secret, those hashes cannot identify you to
          anyone reading the database. Failed-login and waitlist rate-limit records hold an IP
          address until the counter next resets. Analytics and error records held by PostHog
          and Sentry age out on their retention schedules, listed on the subprocessors page.
        </p>
        <p>
          Search Console statistics stay for as long as the site is connected and go when you
          delete the site or your account. Disconnecting Google deletes and revokes the token
          at once; the statistics already collected stay with the site until it is deleted.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Traffic is encrypted in transit with TLS. Credentials and OAuth tokens are encrypted
          at rest with AES-256-GCM on top of whatever our database provider encrypts at the
          disk level. Every database table denies access by default - the database is
          unreachable except through server-side code holding a key that is never sent to a
          browser. Self-hosted dashboard passwords are hashed with scrypt; hosted accounts are
          held by Supabase Auth. Repeated failed logins lock an address out temporarily.
        </p>
        <p>
          No system is perfectly secure, and we do not claim otherwise. If a breach affects
          your personal data and is likely to result in a risk to your rights, we will notify
          the competent supervisory authority within 72 hours of becoming aware of it, and tell
          you directly where the law requires it. Security problems can be reported to{" "}
          <a className="text-white underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can <Term>access</Term> the personal data we hold about you,{" "}
          <Term>correct</Term> it if it is wrong, <Term>delete</Term> it, ask us to{" "}
          <Term>restrict</Term> how we use it, <Term>object</Term> to processing we base on our
          legitimate interests, and receive it in a portable, machine-readable format. Where we
          rely on your consent - Search Console access, and product analytics - you can{" "}
          <Term>withdraw</Term> it at any time, which does not affect anything we did while it
          was in force. Under Israeli law you have the equivalent rights to review and correct
          the data held about you.
        </p>
        <p>
          Most of this is self-serve and immediate. Disconnecting an integration on the
          dashboard deletes its stored token there and then. <Term>Settings</Term> has a{" "}
          <Term>delete account</Term> button that cancels your subscription, removes DispatchSEO
          from your connected repositories, and erases your projects and their entire history
          straight away - we do not hold it for 30 days first. To exercise anything that has no
          button, or to reach data not tied to a live account (a waitlist signup, for example),
          email{" "}
          <a className="text-white underline" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>{" "}
          and we will respond within 30 days. We do not charge for this.
        </p>
        <p>
          You can also revoke DispatchSEO&apos;s access to Google at any time from your{" "}
          <a className="text-white underline" href="https://myaccount.google.com/permissions">
            Google account permissions
          </a>
          .
        </p>
        <p>
          If you think we have handled your data badly, please tell us first - we would rather
          fix it. You also have the right to complain to a supervisory authority: in the EEA,
          the data protection authority where you live or work; in the UK, the Information
          Commissioner&apos;s Office; in Israel, the Privacy Protection Authority.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The hosted service is for people aged 18 and over and is not directed at children. We
          do not knowingly collect personal data from anyone under 18. If you believe a child
          has given us data, email {CONTACT} and we will delete it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          Changes to this policy are published on this page with an updated effective date. If a
          change materially affects how we use data you have already given us, we will tell you
          before it takes effect - by email, or in the product - and, where the change relies on
          your consent, ask for it again. Because DispatchSEO is open source, the full revision
          history of this page is public in the repository.
        </p>
      </Section>

      <p className="text-sm text-neutral-500">
        <Link className="underline" href="/">
          Back to dispatchseo.com
        </Link>
      </p>
    </main>
  );
}
