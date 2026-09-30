import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL } from "@/components/discord-mark";
import { AgentMark } from "@/components/agent-mark";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { availableAgents, type AgentId } from "@/lib/agents";
import { FeatureShowcase } from "./feature-showcase";
import { DomainCta } from "./domain-cta";
import { LandingNav } from "./landing-nav";
import "./landing.css";

// Shared shell for the two agent-specific marketing pages
// (claude-code/page.tsx, codex/page.tsx) - Postiz's "agent hub" pattern:
// same nav, same hero, same features/FAQ/footer as the flagship
// landing page, just written for one agent instead of both, plus a
// cross-link to the other agent's page. One component instead of two
// near-copies of ~500 lines of JSX, so the two pages cannot drift out of
// sync with each other or with the flagship page's markup.
//
// Deliberately no pricing section, no connect/setup section, and no
// signed-in redirect dance - someone landing on /claude-code or /codex from
// a search for "dispatchseo claude code" wants one question answered: does
// this work with my agent. The nav's Pricing link sends them to the
// flagship page's #pricing, and the exact connect command lives in the
// docs (linked from the FAQ) rather than duplicated on the page.

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
const DOCS_URL = "/docs";

const NAV_LINKS = [
  { href: "/#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

type AgentPageId = AgentId;

// The hand-written marketing copy per agent - the one part of an agent's
// landing page that cannot come off the registry, because it is positioning,
// not fact. Everything derivable (the other agents' names/links, the mascot
// tint) is read from src/lib/agents/index.ts below, so adding an agent here
// means: a CONTENT entry, a src/app/<landingPath>/page.tsx wrapper, and a
// sitemap line - docs/AGENTS.md carries the checklist.
type Content = {
  name: string;
  sub: string;
  tag: string;
  faq: { q: string; a: ReactNode }[];
};

const CONTENT: Record<AgentPageId, Content> = {
  claude: {
    name: "Claude Code",
    sub: "Claude Code already knows your product - it wrote it. DispatchSEO gives it the rest: research, guides, pull requests.",
    tag: "Runs on the Claude subscription you already have.",
    faq: [
      {
        q: "Do I need a Claude API key?",
        a: "No. Claude Code runs on your Claude subscription (Pro, Max, Team, or Enterprise) - the free plan doesn't include Claude Code at all. The only thing you generate is a setup token (claude setup-token), and that's just how a scheduled job runs Claude Code as you; it isn't a separate account or a separate bill.",
      },
      {
        q: "Does this work with Claude.ai on the web?",
        a: "No - this connects to Claude Code, the terminal and IDE coding agent, not the Claude.ai chat website. MCP servers plug into coding agents, not the chat UI, so there's nothing to connect there.",
      },
      {
        q: "What do I need before I connect it?",
        a: (
          <>
            Claude Code installed and signed in (see the{" "}
            <a href="/docs/install-claude-code">install guide</a>), a site that lives in a
            GitHub repo, and a DispatchSEO account. Sign up and the dashboard hands you a
            one-paste connect command with your project's key already filled in - see{" "}
            <a href="/docs/connect-your-site">Connect your site</a>.
          </>
        ),
      },
      {
        q: "What can Claude Code actually do here?",
        a: (
          <>
            Everything the dashboard can: research keywords, manage the queue, build a
            guide or tool into a pull request, prospect backlinks, and report on
            rankings. See the full list in{" "}
            <a href="/docs/agent-commands">Agent commands</a>.
          </>
        ),
      },
      {
        q: "Can I use Codex or Cursor instead?",
        a: (
          <>
            Yes - both are fully supported, including the unattended overnight
            builder. See <a href="/codex">DispatchSEO for Codex</a> and{" "}
            <a href="/cursor">DispatchSEO for Cursor</a>.
          </>
        ),
      },
      {
        q: "Will this show up as extra usage on my Claude account?",
        a: "It shows up as Claude Code activity, the same as anything else you ask it to do. DispatchSEO doesn't add a separate bill or a separate account on top of your subscription.",
      },
    ],
  },
  codex: {
    name: "Codex",
    sub: "Codex already knows your product - it wrote it. DispatchSEO gives it the rest: research, guides, pull requests.",
    tag: "Runs on your OpenAI account.",
    faq: [
      {
        q: "Do I need ChatGPT Plus or an API key?",
        a: "Either works for the interactive side - a ChatGPT Plus, Pro, Business, or Enterprise plan, or an API key billed per use. The unattended overnight builder is the exception: it runs headless, so it specifically needs an API key with credit on the account, stored as a secret.",
      },
      {
        q: "Can I use Claude Code or Cursor instead?",
        a: (
          <>
            Yes - both are fully supported, including the unattended builder, and both
            run on a subscription instead of a metered key. See{" "}
            <a href="/claude-code">DispatchSEO for Claude Code</a> and{" "}
            <a href="/cursor">DispatchSEO for Cursor</a>.
          </>
        ),
      },
      {
        q: "Does Codex have slash commands like /seo-research?",
        a: "No - slash commands are a Claude Code file convention Codex doesn't share. You name the get_instructions tool and the workflow directly in a prompt instead; same tools underneath, just spelled out rather than shortcut.",
      },
      {
        q: "Will DispatchSEO bill me for my Codex usage?",
        a: "No. OpenAI bills your account directly, per run - DispatchSEO doesn't add a markup or a separate charge.",
      },
      {
        q: "Does Codex get every tool the dashboard has?",
        a: "Yes - the full set, verified against the actual tool count Codex resolves. Nothing is held back for one agent over the other.",
      },
      {
        q: "Is it safe to leave the overnight builder unattended?",
        a: "Mostly, with one thing to set up first: Claude Code's builder caps itself at 150 turns per run, and Codex has no equivalent ceiling - only the job's own timeout. Set a monthly spend limit on your OpenAI account before you turn it on, and check what your first few runs actually cost.",
      },
    ],
  },
  cursor: {
    name: "Cursor",
    sub: "Cursor already knows your product - it wrote it. DispatchSEO gives it the rest: research, guides, pull requests.",
    tag: "Runs on the Cursor plan you already have.",
    faq: [
      {
        q: "Does Cursor run the overnight builds?",
        a: (
          <>
            Yes. Pick Cursor on Settings and the scheduled jobs run it - the same
            research, the same guides, the same pull requests waiting for you in the
            morning. One thing to know first: those run on a server with no browser, so
            they need a Cursor API key rather than the login you use day to day, and
            any Cursor plan can mint one at cursor.com/dashboard/api. Connecting needs no key at all.
            See <a href="/docs/install-cursor">the Cursor guide</a>.
          </>
        ),
      },
      {
        q: "Which tools does Cursor get?",
        a: "All 61 of them - the same set the dashboard has, checked one by one against what Cursor actually resolves rather than assumed. Some agents' MCP clients quietly drop tools their schema validator doesn't like; Cursor drops none.",
      },
      {
        q: "Do I need a Cursor API key?",
        a: "Not to connect - that's one paste and works on any plan. You need one for the overnight builds, because they run on a server that can't open a browser to log you in. Any plan can mint the key (cursor.com/dashboard/api - open the URL directly, it's often unlinked from the dashboard menu); builds draw on your plan's included usage, so the free pool may not last a nightly schedule.",
      },
      {
        q: "How do I connect it?",
        a: (
          <>
            One paste in your site&apos;s repo folder. The dashboard fills your project
            key in for you, and it merges into any MCP servers you already have rather
            than overwriting them. Full walkthrough in{" "}
            <a href="/docs/install-cursor">the Cursor guide</a>.
          </>
        ),
      },
      {
        q: "Does this work with the Cursor editor, or just the CLI?",
        a: "Both - it's the same config file. The editor and cursor-agent read .cursor/mcp.json alike, so connecting once covers you either way.",
      },
      {
        q: "Will DispatchSEO bill me for my Cursor usage?",
        a: "No. Whatever you run goes through your own Cursor plan, and DispatchSEO never adds a markup or a second bill.",
      },
    ],
  },
};

export function AgentLandingPage({ agentId }: { agentId: AgentPageId }) {
  // Same rule as the flagship landing page: a self-hosted install is a
  // private back office, not a brochure for the cloud product these pages
  // sell. LANDING_ENABLED is unset there, so both agent pages bounce to the
  // dashboard exactly like "/" does.
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

  const c = CONTENT[agentId];
  // Every OTHER supported agent gets a cross-link card - derived from the
  // registry so a new agent shows up on the existing pages automatically.
  const others = availableAgents().filter((a) => a.id !== agentId);

  return (
    <div className={`ld ${jakarta.variable} ${dmSans.variable}`}>
      {/* ==================== NAV ==================== */}
      <nav>
        <div className="nav-wrap nav-in">
          <a className="logo" href="/">
            <DispatchMark className="logo-mark" />
            DispatchSEO
          </a>
          <div className="nav-links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </div>
          <div className="nav-cta">
            <a className="btn btn-ghost btn-sm" href="/login">Log in</a>
            <a className="btn btn-solid btn-sm" href="/signup">Start for free</a>
          </div>
          <LandingNav githubUrl={GITHUB_URL} docsUrl={DOCS_URL} links={NAV_LINKS} />
        </div>
      </nav>

      {/* ==================== HERO ==================== */}
      {/* Same shape as the flagship hero (page.tsx): pixel scene, headline
          with the .hl violet swipe on the agent's name where home swipes
          "AI agents", one CTA. */}
      <header className="hero">
        <div className="wrap">
          <PixelDispatcher variant={agentId} />
          <h1>Automate your SEO<br className="br-desk" /> with <span className="hl">{c.name}</span></h1>
          <p className="sub">{c.sub}<br className="br-desk" /> {c.tag}</p>
          <div className="cta-row" id="get-started">
            <DomainCta />
          </div>
        </div>
      </header>

      {/* ==================== FEATURES ==================== */}
      {/* Byte-identical wrapper to the home page's own #features section
          (band-alt, no .sec-h - the slide titles carry the section, and
          #features already has the matching top-padding override in
          landing.css). */}
      <section className="band-alt" id="features">
        <div className="wrap">
          <FeatureShowcase />
        </div>
      </section>


      {/* ==================== FAQ ==================== */}
      <section className="faq band-alt" id="faq">
        <div className="wrap">
          <div className="sec-h">
            <h2>Fair questions</h2>
          </div>
          <div className="faq-list">
            {c.faq.map((item, i) => (
              <details key={item.q} open={i === 0}>
                <summary>{item.q}</summary>
                <div className="a">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CROSS-LINK ==================== */}
      <section className="agent-crosslink-sec">
        <div className="wrap">
          {others.map((other) => (
            <a key={other.id} className="agent-crosslink" href={other.landingPath}>
              <AgentMark id={other.id} className="agent-crosslink-mark" />
              <span className="agent-crosslink-text">
                <b>Also works with {other.displayName}</b>
                {/* Reads the other agent's capabilities rather than asserting
                    parity. This line used to end "including the unattended
                    builder" for everyone, which the moment a connect-only agent
                    was registered would have made this page advertise a builder
                    that agent does not have - on the marketing page, in our own
                    words. */}
                <span>
                  {other.capabilities.headlessBuilder
                    ? "Same server, same tools, including the unattended builder."
                    : "Same server, same tools. It doesn't run the scheduled builds yet."}
                </span>
              </span>
              <svg className="agent-crosslink-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          ))}
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="final" id="start-final">
        <svg className="doodle doodle-f1" viewBox="0 0 48 56" aria-hidden="true"><path d="M10 7 L30 7 L38 15 L38 49 L10 49 Z M30 7 L30 15 L38 15 M17 27 L31 27 M17 35 L27 35" /></svg>
        <svg className="doodle doodle-f2" viewBox="0 0 64 64" aria-hidden="true"><path d="M8 52 L24 38 L34 46 L56 20 M56 20 L45 22 M56 20 L55 32" /></svg>
        <div className="wrap">
          <h2>Give {c.name} the keys.<br className="br-desk" /> Keep the lock.<span className="caret" /></h2>
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
              <a className="logo" href="/">
                <DispatchMark className="logo-mark" />
                DispatchSEO
              </a>
              <p>The open-source SEO autopilot for AI agents. The agent that knows your product, running its SEO for you.</p>
            </div>
            <div className="foot-col">
              <h4>Product</h4>
              <a href="/#features">Features</a>
              <a href="/#pricing">Pricing</a>
              {availableAgents().map((a) => (
                <a key={a.id} href={a.landingPath}>DispatchSEO for {a.displayName}</a>
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
