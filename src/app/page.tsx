import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { FeatureShowcase } from "./feature-showcase";
import { DomainCta } from "./domain-cta";
import { LandingNav } from "./landing-nav";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { WhyCard } from "@/components/why-card";
import { RotatingWord } from "./rotating-word";
import { availableAgents } from "@/lib/agents";
import { dashboardAuth, maybeSignedIn } from "@/lib/auth-gate";
import { hasConfiguredProject } from "@/lib/onboarding-gate";
import {
  TIER_LIMITS,
  annualBillingAvailable,
  annualSavingsPct,
  priceLabel,
  type Tier,
} from "@/lib/billing";
import { PricingSwitch } from "./pricing-switch";
import "./landing.css";

// Public landing page - cloud deployment only. Self-hosted installs never set
// LANDING_ENABLED, so their / goes straight to the dashboard (whose missing
// cookie bounces them to /login): a self-hosted instance is a private back
// office, not a brochure for our cloud. Design source: docs/landing-mockup.html.

// Per-request rendering: the LANDING_ENABLED check and the ?joined/?error
// form states must be evaluated at runtime, not baked in at build.
export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
// Who the hero speaks to, in the order the slab cycles them. Every entry must
// fit on ONE line after "for" at the desktop size - the headline is two rows
// ("SEO automation" / "for <word>") by design, and "bootstrapped founders"
// was long enough to push "for" onto a row of its own. Hence "bootstrappers".
const AUDIENCES = ["vibe coders", "indie hackers", "bootstrappers", "solo devs"] as const;
const DOCS_URL = "/docs";

export const metadata: Metadata = {
  title: "DispatchSEO - SEO automation for vibe coders and indie founders",
  description:
    "Make your coding agent your SEO manager. It researches from Search Console, writes one article a day and opens a pull request - you merge. For sites built in code (Next.js, Astro, any repo) and WordPress. Open source.",
  // "/" is reachable as itself and as "?home=1" (the signed-in opt-out below),
  // so point both at the bare root rather than letting a crawler treat the
  // query string as a second copy of the landing page.
  alternates: { canonical: "/" },
};

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

// The same price, sized for a third of a phone screen.
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

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

  // Signed-in customers get their dashboard, not the brochure - "/" is a
  // bookmark and a browser autocomplete target, so an existing user typing
  // "dispatchseo.com" means "take me in". The cheap cookie hint runs first so
  // anonymous search traffic never pays the session-verify round-trip.
  // ?home=1 opts out (the footer/legal pages link back here for pricing + FAQ,
  // and those must stay readable while signed in).
  const params = await searchParams;

  // An auth link that lands HERE still carries a live credential: Supabase
  // sends the visitor to the project's Site URL ("/") whenever the caller
  // forgot emailRedirectTo, and older confirmation emails already in inboxes
  // were minted that way. Rendering the brochure would silently drop the
  // sign-in, so hand it to the one route that can spend it. Signup now sets
  // emailRedirectTo (src/lib/origin.ts), which makes this the safety net
  // rather than the main path.
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const code = first(params.code);
  const tokenHash = first(params.token_hash);
  if (code || tokenHash) {
    const forward = new URLSearchParams();
    if (code) forward.set("code", code);
    if (tokenHash) forward.set("token_hash", tokenHash);
    const type = first(params.type);
    if (type) forward.set("type", type);
    const next = first(params.next);
    if (next) forward.set("next", next);
    redirect(`/auth/callback?${forward.toString()}`);
  }

  const signedIn = (await maybeSignedIn()) && Boolean(await dashboardAuth());
  if (params.home === undefined && signedIn) {
    redirect("/dashboard");
  }

  // A signed-in owner whose setup never finished (?home=1 is the wizard's
  // Home exit) gets the way back into the wizard right on the hero, instead
  // of retyping /onboarding or bouncing through /dashboard. Anonymous
  // traffic pays nothing here: maybeSignedIn's cookie hint short-circuits
  // before any session or project lookup.
  const midSetup = signedIn && !(await hasConfiguredProject());

  // The yearly plan is offered only once all three yearly Polar products are
  // configured; until then the cards show the monthly price alone.
  const annual = annualBillingAvailable();

  return (
    <div className={`ld ${jakarta.variable} ${dmSans.variable}`}>
      {/* ==================== NAV ==================== */}
      <nav>
        <div className="nav-wrap nav-in">
          <a className="logo" href="#">
            <DispatchMark className="logo-mark" />
            DispatchSEO
          </a>
          <div className="nav-links">
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/blog">Blog</a>
          </div>
          <div className="nav-cta">
            <a className="btn btn-ghost btn-sm" href="/login">Log in</a>
            <a className="btn btn-solid btn-sm" href="/signup">Start for free</a>
          </div>
          <LandingNav githubUrl={GITHUB_URL} docsUrl={DOCS_URL} />
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <header className="hero">
        <svg className="doodle doodle-l" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 50 L22 35 L33 43 L56 15 M56 15 L45 18 M56 15 L54 27" /></svg>
        <svg className="doodle doodle-r" viewBox="0 0 48 48" aria-hidden="true"><path d="M19 17 L30 43 L33.5 32 L44 29 Z M9 8 L13 12 M6 19 L11.5 20.5 M19 5 L20.5 10.5" /></svg>
        <svg className="doodle doodle-arrow" viewBox="0 0 80 60" aria-hidden="true"><path d="M6 9 C 33 13, 55 27, 63 49 M63 49 L50 44 M63 49 L66 35" /></svg>

        <div className="wrap">
          <PixelDispatcher />
          {midSetup ? (
            <a className="resume-pill" href="/onboarding">
              <span className="rp-dot" aria-hidden="true" />
              Your site is mid-setup — pick up where you left off
              <span aria-hidden="true">→</span>
            </a>
          ) : null}
          {/* .br-desk: the composed two-line break is a desktop luxury - phones
              drop it so the headline reflows to whatever fits. */}
          {/* The audience rotates inside the slab (vibe coders -> indie hackers
              -> bootstrapped founders -> solo devs); the sentence around it and
              the mechanism line below never move. The first word is what the
              server renders, so the crawlable headline is one stable sentence. */}
          <h1>SEO automation<br className="br-desk" /> for <RotatingWord words={AUDIENCES} /></h1>
          <p className="sub">The agent that built your product now runs your SEO.<br className="br-desk" /> Use your AI: Claude app / Claude Code / Codex / Cursor</p>

          <div className="cta-row" id="get-started">
            <DomainCta />
          </div>
        </div>
        {/* The mascot's aside, attached to the hero at every width and in
            normal flow - it scrolls away with the hero rather than following
            the reader. Deliberately a sibling of .wrap, not a child: it hangs
            off the hero's bottom-right corner (where it used to float), which
            means clearing .wrap's 1120px measure. See why-card.tsx. */}
        <WhyCard />
        {/* The hero's OTHER bottom corner: the way to reach a human. Mirrors
            the mascot's note exactly - absolute, 22px off the corner, .hero as
            the positioned ancestor, a sibling of .wrap so it clears the 1120px
            measure - just on the left, because the right is taken. Not
            position: fixed for the same reason the note isn't: a chat-style
            bubble that tracks the reader down the page is an interruption, and
            on a phone it is also a fixed layer repainting over the sticky nav.
            It says "there are people here" next to the CTA and gets out of the
            way. */}
        <div className="discord-hero">
          <a className="dc-link" href={DISCORD_URL} target="_blank" rel="noreferrer">
            <DiscordMark className="dc-mark" />
            Discord support
          </a>
        </div>
      </header>

      {/* ==================== FEATURES ==================== */}
      <section className="band-alt" id="features">
        <div className="wrap">
          <FeatureShowcase />
        </div>
      </section>


      {/* ==================== WHY NOW / WHO FOR ==================== */}
      <section className="band-alt">
        <div className="wrap">
          <div className="sec-h">
            <h2>Who is DispatchSEO for?</h2>
          </div>
          {/* Five cards, 3 + 2 with the second row centred (.who-5 in
              landing.css). Same person wearing different hats, so each card
              argues from a different place: the product, the portfolio, the
              stack, the budget, the procrastination. */}
          <div className="who who-5">
            <div className="who-card">
              <svg className="who-doodle pink" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
              <h3>Founders</h3>
              <p>You have a product to ship and SEO is the job that keeps sliding. Hand it to the agent you already run: it researches, writes one article a day and opens a pull request. You keep the final say.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle vio" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21M5.64 5.64l3.89 3.89M14.47 14.47l3.89 3.89M18.36 5.64l-3.89 3.89M9.53 14.47l-3.89 3.89" /></svg>
              <h3>Indie hackers</h3>
              <p>Three side projects, no marketing time. Each one keeps publishing on a schedule, and you get one weekly note on what moved in Search Console. Distribution stops depending on your Saturday.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle green" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17.5 9 12 4 6.5" /><path d="M12 19h8" /></svg>
              <h3>Vibe coders</h3>
              <p>You built the site with Claude Code or Cursor and it is live. Nobody vibe-coded the SEO. Point the same agent at it and merge what it opens.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle amber" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v10" /><path d="M14.8 9.3c-.5-.9-1.6-1.4-2.8-1.4-1.7 0-2.9.9-2.9 2.1 0 2.7 5.8 1.3 5.8 4 0 1.2-1.2 2.1-2.9 2.1-1.3 0-2.4-.6-2.9-1.5" /></svg>
              <h3>Bootstrapped entrepreneurs</h3>
              <p>Agencies start at $2,000 a month. You already pay $20 for an agent. $29 on top turns it into your SEO manager, with no per-article meter and nothing going live until you say so.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle blue" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.6 9.4v.6M15.4 9.4v.6" /><path d="M8.8 15.2h6.4" /></svg>
              <h3>People who hate doing SEO</h3>
              <p>You know it works. You still put it off every week. Now the research, the writing and the rank checks happen on a schedule, whether you feel like it or not.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing">
        <div className="wrap">
          <div className="sec-h">
            <h2>Pick your plan</h2>
          </div>
          {/* Yearly by default; the switch only exists once the yearly Polar
              products are configured (annualBillingAvailable). Without them
              the children render monthly-only and there is nothing to flip. */}
          <PricingSwitch savingsPct={annualSavingsPct("starter")} enabled={annual}>
          <div className="plans">
            <div className="plan">
              <h3>Starter</h3>
              <PlanPrice tier="starter" annual={annual} />
              <div className="p-sub">One site on autopilot</div>
              <ul>
                <li>Up to 1 site</li>
                <li>One article a day, every day</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Start for free</a>
            </div>
            <div className="plan hero-plan">
              <span className="p-badge">Most popular</span>
              <h3>Growth</h3>
              <PlanPrice tier="growth" annual={annual} />
              <div className="p-sub">For a small portfolio</div>
              <ul>
                <li>Up to 3 sites<span className="li-hint"><button type="button" aria-label="What this costs on GitHub">ⓘ GitHub cost</button><span className="li-pop" role="tooltip">Your first two sites are free on your own GitHub account. After that it&apos;s about $5 per site a month, paid to GitHub, not to us.<a href="/docs/publishing#github-actions-costs">See the cost table</a></span></span></li>
                <li>One article a day, every day</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Growth</a>
            </div>
            <div className="plan">
              <h3>Scale</h3>
              <PlanPrice tier="scale" annual={annual} />
              <div className="p-sub">For a bigger portfolio</div>
              <ul>
                <li>Up to 5 sites<span className="li-hint"><button type="button" aria-label="What this costs on GitHub">ⓘ GitHub cost</button><span className="li-pop" role="tooltip">Your first two sites are free on your own GitHub account. After that it&apos;s about $5 per site a month, paid to GitHub, not to us.<a href="/docs/publishing#github-actions-costs">See the cost table</a></span></span></li>
                <li>One article a day, every day</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Priority support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Scale</a>
            </div>
          </div>

          {/* Mobile pricing (<=980px). The three plans differ in exactly three
              things - price, sites, support - so a phone gets a compare scoreboard plus one shared
              feature list instead of three near-identical twenty-row columns.
              Nothing is dropped: every feature above appears either as a
              compare row or in "On every plan". The .plans grid above is the
              desktop presentation and is hidden here. */}
          <div className="plans-m">
            <table className="pm-table">
              <caption className="ld-sr">Compare plans</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="pm-name">Starter</span>
                    <PmPrice tier="starter" annual={annual} />
                  </th>
                  <th scope="col" className="pm-pick">
                    <span className="pm-flag">Most popular</span>
                    <span className="pm-name">Growth</span>
                    <PmPrice tier="growth" annual={annual} />
                  </th>
                  <th scope="col">
                    <span className="pm-name">Scale</span>
                    <PmPrice tier="scale" annual={annual} />
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>1</b> site</td>
                  <td className="pm-pick"><b>3</b> sites</td>
                  <td><b>5</b> sites</td>
                </tr>
                <tr>
                  <td>Email support</td>
                  <td className="pm-pick">Email support</td>
                  <td>Priority support</td>
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <td><a className="btn btn-solid" href="/signup">Start free</a></td>
                  <td className="pm-pick"><a className="btn btn-solid" href="/signup">Start now</a></td>
                  <td><a className="btn btn-solid" href="/signup">Start now</a></td>
                </tr>
              </tfoot>
            </table>

            <div className="pm-all">
              <h3>On every plan</h3>
              <ul>
                <li>One article a day, every day</li>
                <li>Unlimited AI-built tools</li>
                <li>SERP + search volume data</li>
                <li>Daily rank tracking</li>
                <li>AI Overview tracking</li>
                <li>One-click Search Console</li>
                <li>Hourly Search Console sync</li>
                <li>Index status monitoring</li>
                <li>Domain rating tracking</li>
                <li>Backlink prospecting</li>
                <li>Trending topic scans</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from your AI agent</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
              </ul>
            </div>
          </div>
          </PricingSwitch>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="faq band-alt" id="faq">
        <div className="wrap">
          <div className="sec-h">
            <h2>Fair questions</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>Can I use DispatchSEO for free?</summary>
              <div className="a">Yes, if you self-host it. DispatchSEO is <a href={GITHUB_URL}>open source</a> (AGPL-3.0) and the self-hosted version has every feature: it runs on your machine, under your accounts, so there&apos;s nothing for us to bill. The paid cloud sells convenience: we run the machine, bundle the SERP and volume data into one bill, and replace the Google service account ritual with one click.</div>
            </details>
            <details>
              <summary>What do I need to run the free version?</summary>
              <div className="a">A self-hosted WordPress site or a website that lives in a GitHub repo, an AI (Claude Code on your Claude subscription, Codex on an OpenAI key, Cursor on your Cursor plan, or the ordinary Claude app once your install has a public address), free Google Search Console access, and a machine with Docker. Your laptop works for a test drive, but we highly recommend a machine that stays awake for real use - a $5 VPS or a Raspberry Pi - since schedules only run while it&apos;s on. Rank tracking works with a free SerpApi key; search volume data needs a DataForSEO account, which is the main gap the cloud version fills. The <a href={DOCS_URL}>docs</a> walk you through it.</div>
            </details>
            <details>
              <summary>Does it work with WordPress?</summary>
              <div className="a">Yes, if you host WordPress yourself. You connect it once from Settings with an application password - the kind WordPress generates for you under Users, then Profile - and finished articles get posted straight to the site, with the cover image, internal links to your other pages and the search-engine markup already in place. There&apos;s nothing to install on your side. The other way in is a GitHub repo, where articles arrive as pull requests instead: Next.js, Astro, Hugo, anything you deploy from code. Wix, Squarespace, Shopify, Webflow and Ghost have neither door, so they aren&apos;t supported.</div>
            </details>
            <details>
              <summary>Is this another AI content spammer?</summary>
              <div className="a">No. Every draft is reviewed for quality and sameness before it ships, publishing pace ramps up slowly on purpose, and the agent writes from your product&apos;s actual facts, with your repo as its source material. You choose the gate: approve every piece yourself, or run on auto with pull requests as the audit trail.</div>
            </details>
            <details>
              <summary>Do I need to know SEO?</summary>
              <div className="a">No. The agent does the research and explains each idea in plain language: what the keyword is, why it looks winnable, and what the article should cover. You judge whether it sounds right for your business, which is the part no tool should take from you.</div>
            </details>
            <details>
              <summary>Does it only work with Claude Code?</summary>
              <div className="a">No - Codex is fully supported too, including the overnight builders. Every scheduled workflow carries every supported agent and asks the dashboard which one to run, so you can switch on Settings and it takes effect on the next build, no reinstall. The honest difference is billing: Claude Code runs on the subscription you already have, Codex is metered by OpenAI per run. Cursor works too, including the overnight builders - those need a Cursor API key (any plan can mint one), and builds draw on your Cursor plan's included usage. You can also skip coding agents entirely: the ordinary Claude app at claude.ai connects as a custom connector, researches and writes on the plan you already pay for, and hands the article to us to check, finish and publish. ChatGPT can&apos;t connect yet. Beyond that, the server speaks standard MCP, so any other client (Gemini CLI, Copilot) can connect to the same tools interactively.</div>
            </details>
            <details>
              <summary>What does DispatchSEO do with my Google data?</summary>
              <div className="a">It reads your Google Search Console data with read-only access: the queries your site shows up for, plus clicks, impressions, and average position. That&apos;s what powers the keyword recommendations and the rank tracking. Nothing in your Google account gets modified, nothing is sold or shared, and you can disconnect anytime. Full details on the <a href="/google-data">Google data usage</a> page.</div>
            </details>
            <details>
              <summary>How do I get started on cloud?</summary>
              <div className="a">Sign up and start your 7-day free trial on Starter - you enter a card at checkout, nothing is charged until the trial ends, and you can cancel in one click before then. The setup wizard walks you through connecting your site, about ten minutes end to end. Need more sites right away? Pick Growth or Scale at checkout (billed today), or upgrade anytime.{annual ? <> Paying for the year brings Starter down to {priceLabel(TIER_LIMITS.starter.annual)}/mo ({priceLabel(TIER_LIMITS.starter.annual * 12)} once a year) instead of {priceLabel(TIER_LIMITS.starter.price)}/mo.</> : null}</div>
            </details>
            <details>
              <summary>Are there any costs besides the subscription?</summary>
              <div className="a">One, and it&apos;s not to us: your automations run as GitHub Actions in your own repo, billed to your own GitHub account. Your first two sites or so are covered by GitHub&apos;s free tier at $0. Beyond that it&apos;s roughly $5/site/month, paid straight to GitHub with nothing added by us - GitHub Pro at $4/month is the simplest way to cover a third site.</div>
            </details>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final" id="start-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Give your agent the keys.<br className="br-desk" /> Keep the lock.<span className="caret" /></h2>
          <p>Starter starts with a 7-day free trial. Setup takes about ten minutes.</p>
          <div className="cta-row">
            <a className="btn btn-solid" href="/signup">Start your free trial</a>
          </div>
        </div>
      </section>

      {/* ==================== FOOTER ==================== */}
      <footer>
        <div className="wrap">
          <div className="foot-grid">
            <div className="foot-brand">
              <a className="logo" href="#">
                <DispatchMark className="logo-mark" />
                DispatchSEO
              </a>
              <p>The open-source SEO autopilot for AI agents. The agent that knows your product, running its SEO for you.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
                <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
              {availableAgents().map((a) => (
                <a key={a.id} href={a.landingPath}>
                  DispatchSEO for {a.displayName}
                </a>
              ))}
            </div>
            <div className="foot-col">
              <h4>Open source</h4>
              <a href={GITHUB_URL}>GitHub</a>
              <a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
              <a href={DOCS_URL}>Docs</a>
              <a href="/docs/docker-compose">Self-host guide</a>
              <a href={GITHUB_URL}>AGPL-3.0 license</a>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="/signup">Get started</a>
              <a href="/blog">Blog</a>
              <a href="/privacy">Privacy policy</a>
              <a href="/terms">Terms of service</a>
              <a href="/google-data">Google data usage</a>
              <a href="/subprocessors">Subprocessors</a>
              <a href="/login">Log in</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© DispatchSEO 2026</span>
            <span className="foot-made">
              <svg className="cc-mark" viewBox="24 118 464 262" aria-hidden="true">
                <defs>
                  <linearGradient id="ccGaugeTrack" x1="0.08" y1="0" x2="0.92" y2="0">
                    <stop offset="0" stopColor="#6f6a62" />
                    <stop offset="0.55" stopColor="#c96442" />
                    <stop offset="1" stopColor="#d77e5c" />
                  </linearGradient>
                </defs>
                <path d="M46 349 A210 210 0 0 1 466 349" fill="none" stroke="url(#ccGaugeTrack)" strokeWidth="34" strokeLinecap="round" />
                <rect x="37" y="340" width="18" height="18" fill="#9b958c" />
                <rect x="65" y="235" width="18" height="18" fill="#9b958c" />
                <rect x="142" y="158" width="18" height="18" fill="#9b958c" />
                <rect x="247" y="130" width="18" height="18" fill="#9b958c" />
                <rect x="352" y="158" width="18" height="18" fill="#cf6e4a" />
                <rect x="429" y="235" width="18" height="18" fill="#c96442" />
                <rect x="457" y="340" width="18" height="18" fill="#d77e5c" />
                <polygon points="262.75,365.7 249.25,332.3 423,281.5" fill="#f5f3ec" />
                <circle cx="256" cy="349" r="28" fill="#f5f3ec" />
                <circle cx="256" cy="349" r="12" fill="#c96442" />
              </svg>
              Made with <a href="https://clockedcode.com">ClockedCode</a>
            </span>
            <span className="foot-oss">Proudly <a href={GITHUB_URL}>open source</a> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.35-9.3-8.6A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.4C19 15.65 12 20 12 20Z" /></svg></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
