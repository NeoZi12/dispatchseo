import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { DispatchMark } from "@/components/logo";
import { FeatureShowcase } from "./feature-showcase";
import { DomainCta } from "./domain-cta";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { WhyCard } from "@/components/why-card";
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
const DOCS_URL = "/docs";

export const metadata: Metadata = {
  title: "DispatchSEO - Automate your SEO with Claude Code",
  description:
    "Claude Code researches keywords, writes guides, builds interactive tools, and tracks your ranks automatically. Every piece is a pull request you approve. Open source, free to self-host.",
};

export default async function LandingPage() {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

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
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      <header className="hero">
        <svg className="doodle doodle-l" viewBox="0 0 64 64" aria-hidden="true"><path d="M6 50 L22 35 L33 43 L56 15 M56 15 L45 18 M56 15 L54 27" /></svg>
        <svg className="doodle doodle-r" viewBox="0 0 48 48" aria-hidden="true"><path d="M19 17 L30 43 L33.5 32 L44 29 Z M9 8 L13 12 M6 19 L11.5 20.5 M19 5 L20.5 10.5" /></svg>
        <svg className="doodle doodle-arrow" viewBox="0 0 80 60" aria-hidden="true"><path d="M6 9 C 33 13, 55 27, 63 49 M63 49 L50 44 M63 49 L66 35" /></svg>

        <div className="wrap">
          <PixelDispatcher />
          <h1>Automate your SEO<br />with <span className="hl">Claude Code</span></h1>
          <p className="sub">The agent that built your product now runs your SEO: keyword research, guides, interactive tools, rank tracking - all automatic.</p>

          <div className="cta-row" id="get-started">
            <DomainCta />
          </div>
        </div>
      </header>

      {/* ==================== FEATURES ==================== */}
      <section className="band-alt" id="features">
        <div className="wrap">
          <FeatureShowcase />
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section id="how">
        <div className="wrap">
          <div className="sec-h">
            <h2>Connect it once,<br />then watch it work</h2>
            <p>One pipeline, four steps. The agent thinks, the backend remembers, you decide.</p>
          </div>
          <div className="steps">
            <div className="step">
              <div className="num">1</div>
              <h3>Connect</h3>
              <p>Add the MCP server to Claude Code and point it at your site&apos;s repo. The agent reads your site and writes its own brief.</p>
            </div>
            <div className="step">
              <div className="num">2</div>
              <h3>Research</h3>
              <p>It mines Search Console and SERP data for keywords you can actually win, then queues article ideas with the reasoning attached.</p>
            </div>
            <div className="step">
              <div className="num">3</div>
              <h3>Approve, or automate</h3>
              <p>Approve each idea from the dashboard or chat, or flip on auto mode and let the pipeline ship on schedule, with PRs as the audit trail.</p>
            </div>
            <div className="step">
              <div className="num">4</div>
              <h3>Ship and track</h3>
              <p>Approved ideas come back as pull requests to your repo. Merge, publish, and watch ranks move on the same dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== WHY NOW / WHO FOR ==================== */}
      <section className="band-alt">
        <div className="wrap">
          <div className="sec-h">
            <h2>Who is DispatchSEO for?</h2>
            <p>Every other AI SEO tool learns about you from a homepage crawl. Your agent has the repo: the features, the docs, the decisions, probably its own commits.</p>
          </div>
          <div className="who">
            <div className="who-card">
              <svg className="who-doodle pink" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" /><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" /><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" /></svg>
              <h3>Founders with a product to ship</h3>
              <p>Your site lives in a git repo and your time is better spent on the product. Hand the content grind to your agent and keep the final say on everything.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle vio" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21M5.64 5.64l3.89 3.89M14.47 14.47l3.89 3.89M18.36 5.64l-3.89 3.89M9.53 14.47l-3.89 3.89" /></svg>
              <h3>Claude Code power users</h3>
              <p>You already pay for the best writing model there is. DispatchSEO gives it memory, schedules, and a queue, so SEO stops being a weekend project.</p>
            </div>
            <div className="who-card">
              <svg className="who-doodle blue" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8.6 9.4v.6M15.4 9.4v.6" /><path d="M8.8 15.2h6.4" /></svg>
              <h3>People who hate doing SEO</h3>
              <p>You know it works. You still put it off every week. Now the research, the writing, and the rank checks happen on a schedule, whether you feel like it or not.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section id="pricing">
        <div className="wrap">
          <div className="sec-h">
            <h2>Pick your plan</h2>
            <p>Starter comes with a 7-day free trial; Growth and Scale start today. Unlimited articles on every plan - the writing runs on your own Claude, so we never meter content.</p>
          </div>
          <div className="cloud-adds">
            <span className="ca-label">Every plan includes</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M7 21v-5" /><path d="M12 21V9" /><path d="M17 21v-8" /></svg>bundled SERP + volume data, one bill</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>one-click Search Console connect</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>managed schedules + failure alerts</span>
          </div>
          <div className="plans">
            <div className="plan">
              <h3>Starter</h3>
              <div className="p-price">$49<small>/mo</small></div>
              <div className="p-sub">One site on autopilot</div>
              <ul>
                <li>1 site</li>
                <li>100 tracked keywords</li>
                <li>Unlimited articles</li>
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
                <li>Drive it from Claude Code</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Start for free</a>
            </div>
            <div className="plan hero-plan">
              <span className="p-badge">Most popular</span>
              <h3>Growth</h3>
              <div className="p-price">$99<small>/mo</small></div>
              <div className="p-sub">For a small portfolio</div>
              <ul>
                <li>3 sites</li>
                <li>300 tracked keywords</li>
                <li>Unlimited articles</li>
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
                <li>Weekly opportunity digest</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from Claude Code</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Email support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Growth</a>
            </div>
            <div className="plan">
              <h3>Scale</h3>
              <div className="p-price">$149<small>/mo</small></div>
              <div className="p-sub">Portfolios and agencies</div>
              <ul>
                <li>10 sites</li>
                <li>1,000 tracked keywords</li>
                <li>Unlimited articles</li>
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
                <li>Weekly opportunity digest</li>
                <li>Content quality checks</li>
                <li>Approve or full-auto mode</li>
                <li>Everything ships as PRs</li>
                <li>Drive it from Claude Code</li>
                <li>Managed schedules</li>
                <li>Failure alerts by email</li>
                <li>Priority support</li>
              </ul>
              <a className="btn btn-solid" href="/signup">Choose Scale</a>
            </div>
          </div>
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
              <div className="a">A website that lives in a GitHub repo, a Claude subscription with Claude Code, free Google Search Console access, and a machine with Docker. Your laptop works for a test drive; for the always-on autopilot you&apos;ll want something that stays awake, like a $5 VPS or a Raspberry Pi. Rank tracking works with a free SerpApi key; search volume data needs a DataForSEO account, which is the main gap the cloud version fills. The <a href={DOCS_URL}>docs</a> walk you through it.</div>
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
              <div className="a">Claude Code is the first-class path and what we test against. The server speaks standard MCP though, so other MCP clients can connect to the same tools. Adapters for other coding agents will come when people ask for them.</div>
            </details>
            <details>
              <summary>What does DispatchSEO do with my Google data?</summary>
              <div className="a">It reads your Google Search Console data with read-only access: the queries your site shows up for, plus clicks, impressions, and average position. That&apos;s what powers the keyword recommendations and the rank tracking. Nothing in your Google account gets modified, nothing is sold or shared, and you can disconnect anytime. Full details on the <a href="/google-data">Google data usage</a> page.</div>
            </details>
            <details>
              <summary>How do I get started on cloud?</summary>
              <div className="a">Sign up and start your 7-day free trial on Starter - you enter a card at checkout, nothing is charged until the trial ends, and you can cancel in one click before then. The setup wizard walks you through connecting your site, about ten minutes end to end. Need more sites right away? Pick Growth or Scale at checkout (billed today), or upgrade anytime.</div>
            </details>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final" id="start-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Give your agent the keys.<br />Keep the lock.<span className="caret" /></h2>
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
              <p>The open-source SEO autopilot for Claude Code. The agent that knows your product, running its SEO for you.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="#how">How it works</a>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h4>Open source</h4>
              <a href={GITHUB_URL}>GitHub</a>
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

      {/* ==================== FLOATING MASCOT EXPLAINER ==================== */}
      <WhyCard />
    </div>
  );
}
