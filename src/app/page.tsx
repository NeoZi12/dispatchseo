import type { Metadata } from "next";
import { Caveat, DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { FeatureShowcase } from "./feature-showcase";
import { ChecksLine } from "./checks-line";
import { ScrollReveal } from "./scroll-reveal";
import { DomainCta } from "./domain-cta";
import { LandingNav } from "./landing-nav";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { CardMascot } from "@/components/card-mascot";
import { RotatingWord } from "./rotating-word";
import { availableAgents } from "@/lib/agents";
import { dashboardAuth, maybeSignedIn } from "@/lib/auth-gate";
import { hasConfiguredProject } from "@/lib/onboarding-gate";
import {
  TIER_LIMITS,
  TIER_NAMES,
  annualBillingAvailable,
  articlesPerMonthFor,
  annualSavingsPct,
  priceLabel,
  type Tier,
} from "@/lib/billing";
import { PricingSwitch } from "./pricing-switch";
import { brandJsonLdHtml } from "@/lib/brand";
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
// The hero's handwritten "Type your domain" note (domain-cta.tsx) - one
// weight, latin only, self-hosted by next/font like the two above.
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
// Who the hero speaks to, in the order the slab cycles them. Every entry must
// fit on ONE line after "for" at the desktop size - the headline is two rows
// ("Google traffic on autopilot" / "for <word>") by design, and "bootstrapped founders"
// was long enough to push "for" onto a row of its own. Ordered for reach, most
// visitors first (owner, 2026-11-08): the broad label, the hot one, the launch
// crowd, the biggest buyers, then devs who wouldn't call themselves founders.
// "online stores" and "online schools" added 2026-11-08 from real signups:
// stores were 4 of ~25 (mostly Shopify, which setup's qualifier turns away
// until Shopify is supported) and schools/course sellers another 4. The two
// "online" words never sit next to each other in the cycle.
const AUDIENCES = ["startups", "vibe coders", "indie hackers", "online stores", "agencies", "online schools", "side projects"] as const;
const DOCS_URL = "/docs";

// The repo's real star count, for the hero's trust badge. Cached for an hour
// (GitHub allows 60 anonymous calls an hour per IP, so per-request would run
// out) and capped at 2 s so a slow GitHub never holds the landing page.
// Falls back to the last count we saw - it only ever under-states.
const STARS_FALLBACK = 97;
// Six real stargazers' avatars (picked 2026-11-08 from the repo's stargazer
// list). Owner's rule: no photos of real faces - two cartoon avatars and four
// picture avatars (scenery, a cat, a keyboard). GitHub user ids, so a rename
// never breaks the image; the picture itself stays live on GitHub.
const STARGAZER_FACES = [6379873, 507482, 7113831, 2047212, 260022910, 51628970] as const;
async function githubStars(): Promise<number> {
  try {
    const res = await fetch("https://api.github.com/repos/NeoZi12/dispatchseo", {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return STARS_FALLBACK;
    const n = (await res.json())?.stargazers_count;
    return typeof n === "number" && n >= STARS_FALLBACK ? n : STARS_FALLBACK;
  } catch {
    return STARS_FALLBACK;
  }
}

export const metadata: Metadata = {
  title: "DispatchSEO - Free SEO automation for bootstrappers, solo devs and small shops",
  description:
    "Free SEO automation: researched, fact-checked articles published to your site on autopilot. Get found on Google, ChatGPT and Claude. Two a month free.",
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

// The mobile pricing cards' paid plans. Articles a month come from billing.ts
// (1 / 3 / 5 a week x 4), so a pace change can't leave these behind.
const PM_PAID: { tier: Tier; perMonth: number; tagline: string; lead: string; ticks: string[]; pick: boolean }[] = [
  {
    tier: "starter", perMonth: articlesPerMonthFor("starter"), pick: false,
    tagline: "Steady start, weekly articles", lead: "Everything in Free, plus",
    ticks: ["Weekly keyword research", "Keyword rankings", "Advanced analytics", "No DispatchSEO badge", "Email support"],
  },
  {
    tier: "growth", perMonth: articlesPerMonthFor("growth"), pick: true,
    tagline: "Serious about traffic", lead: "Everything in Starter, plus",
    ticks: ["8 more articles a month"],
  },
  {
    tier: "scale", perMonth: articlesPerMonthFor("scale"), pick: false,
    tagline: "All in on content", lead: "Everything in Growth, plus",
    ticks: ["8 more articles a month", "Priority support"],
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
  const stars = await githubStars();

  return (
    <div className={`ld ${jakarta.variable} ${dmSans.variable} ${caveat.variable}`}>
      {/* Organization + SoftwareApplication with the live plan prices
          (lib/brand.ts) - the same facts the plan cards show, as data. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: brandJsonLdHtml() }} />
      <ScrollReveal />
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
              drop it so the copy reflows to whatever fits. The h1 is the one
              exception (.br-h1 stays at every width): its last word rotates,
              and when the break was left to the browser a longer audience
              pushed "autopilot" down a row and a shorter one pulled it back,
              so the headline bounced every few seconds. With a hard break
              before "for", only the final row ever changes shape. */}
          {/* The audience rotates inside the slab (startups -> vibe coders ->
              indie hackers -> online stores -> agencies -> online schools -> side
              projects); the sentence around it and the
              two-row sub below never move. The first word is what the server
              renders, so the crawlable headline is one stable sentence. The sub
              is two plain rows: the outcome and the price ("…traffic for free"),
              then what we ship (SEO articles, published for you). Two rows max -
              anything more goes in the CTA's small print. */}
          <h1>Google traffic on autopilot<br className="br-h1" /> for <RotatingWord words={AUDIENCES} /></h1>
          <p className="sub">Get Google, ChatGPT and Claude traffic for free.<br className="br-desk" /> Researched, fact-checked SEO articles, published to your site on autopilot.</p>

          <div className="cta-row" id="get-started">
            <DomainCta />
          </div>
          {/* Trust row: real stargazers' avatars + the live GitHub star count.
              The whole row links to the repo, so the source of the number is
              one click away. Never "N people use this": a star is not a user. */}
          <a className="gh-proof" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <span className="gh-faces" aria-hidden="true">
              {STARGAZER_FACES.map((id) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={id} src={`https://avatars.githubusercontent.com/u/${id}?s=96`} alt="" width={44} height={44} loading="lazy" />
              ))}
            </span>
            <span className="gh-proof-text">
              <span className="gh-proof-stars" aria-hidden="true">★★★★★</span>
              <span>
                Loved by <b>{stars}</b> people
              </span>
            </span>
          </a>
        </div>
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

      {/* ==================== THE FIVE CHECKS ==================== */}
      {/* The carousel above shows the outcome (visitors); this answers the
          buyer's real fear - "AI content will hurt my site" - as five flat
          icons on one line, scannable in seconds. Sits on the plain
          background so the page alternates band / plain / band. */}
      <section id="checks">
        <div className="wrap">
          <div className="sec-h">
            <h2>Not another slop factory</h2>
          </div>
          <ChecksLine />
        </div>
      </section>


      {/* ==================== WHO FOR ==================== */}
      <section className="band-alt">
        <div className="wrap">
          <div className="sec-h">
            <h2>Who is DispatchSEO for?</h2>
          </div>
          {/* Five cards, 3 + 2 with the second row centred (.who-5 in
              landing.css). Picked from who actually signed up (2026-11-08):
              product builders first, then the agencies, stores and schools
              that make up the rest. Every card argues from the reader's own
              situation, and none promises a platform we can't publish to. */}
          {/* Ink wobble for the hand-drawn icons: a little noise displaces every
              stroke so the lines read as pen, not vector. Zero-size, defs only. */}
          <svg className="ld-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs><filter id="ld-sketch" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="7" /><feDisplacementMap in="SourceGraphic" scale="2.4" /></filter></defs></svg>
          <div className="who who-5">
            <div className="who-card">
              <svg className="who-doodle pink" viewBox="0 0 64 64" aria-hidden="true"><path d="M41 9c7-2.2 12.2-2 14 .2 2.1 2.8 1 9-2.2 14.8-4.8 8.8-12.6 15.8-20.8 20L21 33c3.8-9.2 10.6-19.2 20-24z" /><path className="re" d="M42.2 10.6c5.8-1.6 9.8-1.2 11.6.4" /><path d="M44.4 23.4c.3 2.7-1.8 5-4.5 5.1-2.7.1-4.7-2-4.5-4.6.2-2.6 2.4-4.4 4.9-4.3 2.2.1 3.9 1.7 4.1 3.8z" /><path d="M21.6 32.4l-9.4 1.2-4.4 8.2 10.2-2.2" /><path d="M31.6 43.6l-1.2 9.6-8 4.2 2.4-10.4" /><path d="M15.2 46.8c-3.4 2.4-5.6 6.4-5.8 10.4 3.6-.2 7.6-2.2 9.8-5.6" /><path className="re" d="M7 42.4l3.2-.8M5.4 50.2l3-1.2" /></svg>
              <h3>Startups</h3>
              <p>SEO keeps sliding to next week. Connect your site once and new articles keep landing, with no one on the team writing them.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle green" viewBox="0 0 64 64" aria-hidden="true"><path d="M8.4 13.6c15.2-1.2 32.8-1 47.6.2 1 11.2 1.2 24 .2 36.2-15 1.2-33 1-48-.2-1-12-1.2-24.4.2-36.2z" /><path className="re" d="M9.6 15.2c14-.8 30.4-.8 45 .2" /><path d="M8.8 22.4c15.4.8 31.6.6 47-.2" /><path d="M13 18.2h.2M17.4 18.1h.2M21.8 18.3h.2" /><path d="M15.6 30.6l7.4 5.2-7.2 5.4" /><path d="M27.6 42.2c4.2.4 8.4.2 12.6-.4" /></svg>
              <h3>Vibe coders</h3>
              <p>You shipped the site. Nobody vibe-coded the SEO. Connect the repo and your blog fills itself.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle vio" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 9.2c-8.8-.2-15.2 6.6-15 14.6.1 5.8 3 9 6 12 2 2.1 2.4 4.6 2.4 7h13.4c0-2.8.8-5 2.8-7 3.2-3.2 6-6.4 6-12.2 0-8.4-6.8-14.6-15.6-14.4z" /><path className="re" d="M27.6 11.2c-5 1.6-8.6 6-8.8 11" /><path d="M25.4 47.4c4.4.5 9 .4 13.6-.2M26.4 52.4c3.8.4 7.6.3 11.4-.1M29.2 57.2c2 .3 4 .2 5.8-.1" /><path d="M28.2 36.4c-.2-4.8.8-8.8 3.8-11 3.2 2 4.2 6.2 4 11" /><path d="M32 2.6v2.6M12.6 9.8l2 2.2M51.6 9.6l-2 2.4M5.8 24.2h3.4M55 24.4h3.2" /></svg>
              <h3>Indie hackers</h3>
              <p>Too many projects, no time to market them. Put each one on the free plan and let Google show you the winner.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle amber" viewBox="0 0 64 64" aria-hidden="true"><path d="M8.8 22.2l5.2-12.4c12-.4 24.2-.4 36.4.2l5 12" /><path d="M8.8 22.4c.2 4.2 7 4.4 7.4.2.4 4.2 7.8 4.4 8-.2.4 4.4 7.8 4.4 8 0 .2 4.2 7.6 4.4 7.8-.2.4 4.4 7.8 4.2 8-.2.4 4.4 7.4 4 7.4-.2" /><path className="re" d="M10.4 21.2l4.6-10" /><path d="M12.2 27.4c-.2 9.4 0 18.6.2 27.8M51.8 27.6c.2 9.2 0 18.4-.2 27.6M10 55.2c14.8.8 29.6.6 44.2-.2" /><path d="M27.2 55V40.4c0-1.2.8-2 2-2h6c1.2 0 2 .8 2 2V55" /><path d="M41.2 35.2c2.2-.2 4.8-.2 7 .1.2 2.8.2 5.4-.1 8-2.2.2-4.8.2-7-.1-.2-2.6-.2-5.4.1-8z" /></svg>
              <h3>Online stores and schools</h3>
              <p>Buyers and students search before they choose. Be the answer they find, not your competitor.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle blue" viewBox="0 0 64 64" aria-hidden="true"><path d="M9 23.2c15.2-1.2 31.4-1 46.2.2 1 9.2 1.2 21.2 0 31-15 1.2-31.2 1-46.2-.2-1.2-10-1.2-21.6 0-31z" /><path className="re" d="M10.6 25c14.4-.8 29-.8 43 .2" /><path d="M24.2 22.6v-6c0-2 1.2-3.2 3.2-3.2h9.4c2 0 3.2 1.2 3.2 3.2v6" /><path d="M9.6 35.4c7.8 2 15 3 22.4 3s14.8-1.2 22.4-3.2" /><path d="M29 36.4c2-.3 4-.3 6 .1v5c-2 .3-4 .3-6-.1z" /></svg>
              <h3>Agencies</h3>
              <p>Steady articles for every client site, without hiring writers. Each site has its own Google numbers to show.</p>
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
          {/* Prices come from TIER_LIMITS (billing.ts); the ticks follow the
              free/paid split decided 2026-11-06/08: free keeps the result
              (articles + its Google numbers), paid adds the pace, weekly
              research, rankings, advanced analytics and drops the badge.
              Paid counts are stated flat and per month (4 / 12 / 20 a month =
              1 / 3 / 5 a week x 4, owner 2026-11-09), never "up to"
              (owner, 2026-11-08: people get what they pay for). Same perks as the dashboard's upgrade panel - keep the
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
              <div className="p-sub">Steady start, weekly articles</div>
              <ul>
                <li>4 articles a month</li>
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
                <li>12 articles a month</li>
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
                <li>20 articles a month</li>
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
          {/* Mobile pricing (<=980px): one stacked card per plan in the desktop
              cards' language - name, tagline, the articles a month as the
              headline, price, button, then a short "everything in X, plus"
              list so four cards don't repeat the same ticks four times. */}
          <div className="plans-m">
            <div className="pm-list">
              <div className="pm-card">
                <span className="pm-name">Free</span>
                <span className="pm-tag">Try it on a side project</span>
                <div className="pm-stat"><b>2</b><span>articles a month</span></div>
                <span className="pm-price">$0<small>/forever</small></span>
                <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
                <ul className="pm-ticks">
                  <li>Topics people search for</li>
                  <li>Fact-checked articles</li>
                  <li>Published for you</li>
                  <li>Your Google stats</li>
                </ul>
              </div>
              {PM_PAID.map((plan) => (
                <div key={plan.tier} className={`pm-card${plan.pick ? " pm-pick" : ""}`}>
                  {plan.pick ? (
                    <>
                      <span className="pm-flag">Most popular</span>
                      <CardMascot className="pm-mascot" />
                    </>
                  ) : null}
                  <span className="pm-name">{TIER_NAMES[plan.tier]}</span>
                  <span className="pm-tag">{plan.tagline}</span>
                  <div className="pm-stat"><b>{plan.perMonth}</b><span>articles a month</span></div>
                  <PmPrice tier={plan.tier} annual={annual} />
                  <PlanLink tier={plan.tier} annual={annual}>Choose {TIER_NAMES[plan.tier]}</PlanLink>
                  <p className="pm-lead">{plan.lead}</p>
                  <ul className="pm-ticks">
                    {plan.ticks.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              ))}
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
              <summary>Is it really free?</summary>
              <div className="a">Yes. Every site gets 2 articles a month for free, with no card and no end date. Free articles carry a small DispatchSEO badge. The paid plans publish every week, without the badge.</div>
            </details>
            <details>
              <summary>What do I need to get started?</summary>
              <div className="a">A website that lives in a GitHub repo (Next.js, Astro, Hugo, anything you deploy from code) and a free Google Search Console account. Setup connects both. Your first article usually goes live within a few hours, and you can watch it being written on your dashboard.</div>
            </details>
            <details>
              <summary>Does it work with WordPress, Shopify, Wix or Webflow?</summary>
              <div className="a">Not yet. Right now DispatchSEO publishes to sites that live in a GitHub repo. WordPress, Shopify, Wix, Squarespace, Webflow and Ghost aren&apos;t supported yet.</div>
            </details>
            <details>
              <summary>How many articles will I get?</summary>
              <div className="a">2 a month on Free, 4 a month on Starter, 12 a month on Growth and 20 a month on Scale. Every one is about a topic with real search demand behind it.</div>
            </details>
            <details>
              <summary>Is this another AI content spammer?</summary>
              <div className="a">No. Every topic comes from keyword research with real monthly searches behind it. Every claim in an article is checked against a source before it goes live, and publishing keeps a steady pace, never two articles in one day. If Google stops showing your site, publishing pauses itself.</div>
            </details>
            <details>
              <summary>Do I need to know SEO?</summary>
              <div className="a">No. DispatchSEO picks the topics, writes the articles and publishes them. Your dashboard shows in plain words how Google is responding: who visits, how often you show up, and which articles bring people in.</div>
            </details>
            <details>
              <summary>What does DispatchSEO do with my Google data?</summary>
              <div className="a">It reads your Google Search Console data with read-only access: the queries your site shows up for, plus clicks, impressions, and average position. That&apos;s what powers the keyword recommendations and the rank tracking. Nothing in your Google account gets modified, nothing is sold or shared, and you can disconnect anytime. Full details on the <a href="/google-data">Google data usage</a> page.</div>
            </details>
            <details>
              <summary>Can I cancel anytime?</summary>
              <div className="a">Yes. Paid plans cancel from the Billing page with no questions asked, and there&apos;s nothing to cancel on the free plan.{annual ? <> Paying for the year brings Starter down to {priceLabel(TIER_LIMITS.starter.annual)}/mo ({priceLabel(TIER_LIMITS.starter.annual * 12)} once a year) instead of {priceLabel(TIER_LIMITS.starter.price)}/mo.</> : null}</div>
            </details>
            <details>
              <summary>Is DispatchSEO open source?</summary>
              <div className="a">Yes. The code is on <a href={GITHUB_URL}>GitHub</a> under AGPL-3.0, and you can run it yourself with your own accounts. The cloud version runs everything for you.</div>
            </details>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final" id="start-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Start getting found today.<span className="caret" /></h2>
          <p>2 articles a month, researched, fact-checked and published for you. No card.</p>
          <div className="cta-row">
            {/* The mascot again, sitting on the last button on the page. */}
            <span className="final-cta-wrap">
              <CardMascot className="cta-mascot" />
              <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
            </span>
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
              <p>Researched, fact-checked SEO articles, published to your site on autopilot. Free for 2 articles a month.</p>
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
