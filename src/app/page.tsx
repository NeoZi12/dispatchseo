import type { Metadata } from "next";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DispatchMark } from "@/components/logo";
import { joinWaitlist, waitlistAttemptAllowed } from "@/lib/waitlist";
import { clientIp } from "@/lib/login-lockout";
import { FeatureShowcase } from "./feature-showcase";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
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
  title: "DispatchSEO — Automate your SEO with Claude Code",
  description:
    "Claude Code researches keywords, writes guides, builds interactive tools, and tracks your ranks automatically. Every piece is a pull request you approve. Open source, free to self-host.",
};

async function join(formData: FormData) {
  "use server";
  const anchor = String(formData.get("source") ?? "") === "final" ? "waitlist-final" : "waitlist";
  // Honeypot: bots fill every field. Pretend success so they move on.
  if (String(formData.get("website") ?? "") !== "") redirect(`/?joined=1#${anchor}`);
  // Rate limit (5/IP/hour) gets the same pretend-success treatment: a sixth
  // signup from one IP inside an hour is a script, and duplicates are
  // "success" anyway, so there is nothing to tell a real person.
  if (!(await waitlistAttemptAllowed(clientIp(await headers())))) {
    redirect(`/?joined=1#${anchor}`);
  }
  const email = String(formData.get("email") ?? "");
  const result = await joinWaitlist(email, "landing");
  redirect(result.ok ? `/?joined=1#${anchor}` : `/?error=email#${anchor}`);
}

function WaitlistForm({ joined, error, source }: { joined: boolean; error: boolean; source: string }) {
  if (joined) {
    return (
      <p className="joined">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        You&apos;re on the list. Watch your inbox.
      </p>
    );
  }
  return (
    <>
      <form action={join} className="email-group">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hp" />
        <input type="hidden" name="source" value={source} />
        <input type="email" name="email" required placeholder="you@company.com" aria-label="Email address" />
        <button className="btn btn-solid" type="submit">Join the waitlist</button>
      </form>
      {error ? <p className="form-error">That email didn&apos;t look right. Try again?</p> : null}
    </>
  );
}

function GithubIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" /></svg>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ joined?: string; error?: string }>;
}) {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");
  const { joined, error } = await searchParams;
  const isJoined = joined === "1";
  const isError = error === "email";

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
            <a href="#oss">Open source</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
            <a href="/blog">Blog</a>
            <a href="/login">Log in</a>
          </div>
          <div className="nav-cta">
            <a className="gh-link" href={GITHUB_URL}>
              <GithubIcon />
              GitHub
            </a>
            <a className="btn btn-solid btn-sm" href="#waitlist">Join the waitlist</a>
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

          <div className="cta-row" id="waitlist">
            <WaitlistForm joined={isJoined} error={isError} source="hero" />
          </div>
          <p className="hero-note">
            <svg className="gift-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C9.5 3 11 5 12 8c1-3 2.5-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
            Waitlist members lock in founding pricing at launch.
          </p>
          <a className="btn btn-ghost btn-sm hero-selfhost" href={GITHUB_URL}>
            <GithubIcon />
            Self-host now for free
          </a>

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

      {/* ==================== OPEN SOURCE ==================== */}
      <section className="oss" id="oss">
        <div className="wrap oss-in">
          <div className="oss-copy">
            <h2>Free forever, if you host it yourself</h2>
            <p>DispatchSEO is open source under AGPL-3.0, with zero feature gating. The self-hosted version is the whole product, and it runs end to end on free tiers: Vercel, Supabase, Search Console, plus the Claude subscription you already have.</p>
            <p>Setup is agent-driven. Deploy, add the MCP server, and tell your agent to set itself up. It follows the instructions so you don&apos;t have to.</p>
            <div className="oss-badges">
              <span className="oss-badge">AGPL-3.0</span>
              <span className="oss-badge">Zero feature limits</span>
              <span className="oss-badge">Your accounts, your keys</span>
              <span className="oss-badge">Deploy to Vercel</span>
            </div>
            <div className="oss-btns">
              <a className="btn btn-solid" href={GITHUB_URL}>
                <GithubIcon />
                Star on GitHub
              </a>
              <a className="btn btn-ghost" href={DOCS_URL}>Read the docs</a>
            </div>
          </div>
          <div className="term">
            <div className="t-dots"><i /><i /><i /></div>
            <div><span className="dim">$</span> <span className="cmd">claude mcp add dispatchseo https://yourdeploy.vercel.app/api/mcp</span></div>
            <div><span className="dim">$</span> <span className="cmd">claude</span></div>
            <div><span className="dim">&gt;</span> <span className="cmd">set up my site for SEO</span></div>
            <div className="out">● Read your repo: Next.js blog, 24 posts, docs site</div>
            <div className="out">● Wrote the site profile and started tracking 40 keywords</div>
            <div className="out">● Queued 6 article ideas for your review</div>
            <div><span className="dim">Your move: approve them at yourdeploy.vercel.app</span></div>
          </div>
        </div>
      </section>

      {/* ==================== PRICING ==================== */}
      <section className="band-alt" id="pricing">
        <div className="wrap">
          <div className="sec-h">
            <h2>Self-host free.<br />Cloud, when it lands.</h2>
          </div>
          <p className="price-note">Cloud pricing below is <b>planned, not final</b>. Joining the waitlist locks in founding-member pricing at launch.</p>
          <div className="cloud-adds">
            <span className="ca-label">Cloud adds</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M7 21v-5" /><path d="M12 21V9" /><path d="M17 21v-8" /></svg>bundled SERP + volume data, one bill</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></svg>one-click Search Console connect</span>
            <span className="ca-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>managed schedules + failure alerts</span>
          </div>
          <div className="plans">
            <div className="plan">
              <span className="p-badge soft">Available now</span>
              <h3>Self-host</h3>
              <div className="p-price">$0<small> forever</small></div>
              <div className="p-sub">The whole product, in your accounts</div>
              <ul>
                <li>Every feature, no gating</li>
                <li>Unlimited sites and keywords</li>
                <li>Bring your own data keys</li>
                <li>Community support</li>
              </ul>
              <a className="btn btn-ghost" href="#oss">Deploy from GitHub</a>
            </div>
            <div className="plan">
              <span className="p-badge soft">Coming soon</span>
              <h3>Starter</h3>
              <div className="p-price">$49<small>/mo</small></div>
              <div className="p-sub">One site on autopilot</div>
              <ul>
                <li>1 site</li>
                <li>100 tracked keywords</li>
                <li>Bundled SERP + volume data</li>
                <li>One-click Search Console</li>
                <li>Managed schedules + alerts</li>
              </ul>
              <a className="btn btn-solid" href="#waitlist">Join the waitlist</a>
            </div>
            <div className="plan hero-plan">
              <span className="p-badge">Coming soon</span>
              <h3>Growth</h3>
              <div className="p-price">$99<small>/mo</small></div>
              <div className="p-sub">For a small portfolio</div>
              <ul>
                <li>3 sites</li>
                <li>300 tracked keywords</li>
                <li>Everything in Starter</li>
                <li>Weekly opportunity digest</li>
              </ul>
              <a className="btn btn-solid" href="#waitlist">Join the waitlist</a>
            </div>
            <div className="plan">
              <span className="p-badge soft">Coming soon</span>
              <h3>Scale</h3>
              <div className="p-price">$149<small>/mo</small></div>
              <div className="p-sub">Portfolios and agencies</div>
              <ul>
                <li>10 sites</li>
                <li>1,000 tracked keywords</li>
                <li>Everything in Growth</li>
                <li>Priority support</li>
              </ul>
              <a className="btn btn-solid" href="#waitlist">Join the waitlist</a>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="faq" id="faq">
        <div className="wrap">
          <div className="sec-h">
            <h2>Fair questions</h2>
          </div>
          <div className="faq-list">
            <details open>
              <summary>Is this another AI content spammer?</summary>
              <div className="a">No. Every draft is reviewed for quality and sameness before it ships, publishing pace ramps up slowly on purpose, and the agent writes from your product&apos;s actual facts, with your repo as its source material. You choose the gate: approve every piece yourself, or run on auto with pull requests as the audit trail.</div>
            </details>
            <details>
              <summary>What do I need to run the free version?</summary>
              <div className="a">A website that lives in a GitHub repo, a Claude subscription with Claude Code, and free accounts on Vercel, Supabase, and Google Search Console. Rank tracking works with a free SerpApi key; search volume data needs a DataForSEO account, which is the main gap the cloud version fills.</div>
            </details>
            <details>
              <summary>Is it really free? What&apos;s the catch?</summary>
              <div className="a">The code is AGPL-3.0 and the self-hosted version has every feature. It runs in your own accounts, so there&apos;s nothing for us to bill. The paid cloud sells convenience: we host it, bundle the SERP and volume data into one bill, and replace the Google service account ritual with one click.</div>
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
              <summary>When does the cloud version launch?</summary>
              <div className="a">When the waitlist proves the demand. Waitlist members get the first invites and founding-member pricing. Meanwhile the self-hosted version is complete and free, so you don&apos;t have to wait to start.</div>
            </details>
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final band-alt" id="waitlist-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Give your agent the keys.<br />Keep the lock.<span className="caret" /></h2>
          <p>Be first in line when the cloud version opens. Founding-member pricing for everyone on the list.</p>
          <div className="cta-row">
            <WaitlistForm joined={isJoined} error={isError} source="final" />
          </div>
          <p className="hero-note">Or don&apos;t wait: <a href="#oss">self-host it free today</a>.</p>
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
              <a href={DOCS_URL}>Self-host guide</a>
              <a href={GITHUB_URL}>AGPL-3.0 license</a>
            </div>
            <div className="foot-col">
              <h4>Company</h4>
              <a href="#waitlist">Cloud waitlist</a>
              <a href="/blog">Blog</a>
              <a href="/privacy">Privacy policy</a>
              <a href="/login">Log in</a>
            </div>
          </div>
          <div className="foot-bottom">
            <span>© DispatchSEO 2026</span>
            <span className="foot-oss">Proudly <a href={GITHUB_URL}>open source</a> <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20s-7-4.35-9.3-8.6A5 5 0 0 1 12 6a5 5 0 0 1 9.3 5.4C19 15.65 12 20 12 20Z" /></svg></span>
          </div>
        </div>
      </footer>
    </div>
  );
}
