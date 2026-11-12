import { DispatchMark } from "@/components/logo";
import { DISCORD_URL } from "@/components/discord-mark";
import { availableAgents } from "@/lib/agents";

// The landing page's footer, shared with the public pages that wear the same
// chrome (/pricing). Needs the .ld root (landing.css) around it.
//
// `home` is true only on "/" itself: there the section links are bare anchors
// (#features), because "/#features" from a signed-in "/?home=1" view would load
// "/" again and bounce the owner to their dashboard. Everywhere else they are
// absolute.

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
const DOCS_URL = "/docs";

export function SiteFooter({ home = false }: { home?: boolean }) {
  const base = home ? "" : "/";
  return (
    <footer>
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <a className="logo" href={home ? "#" : "/"}>
              <DispatchMark className="logo-mark" />
              DispatchSEO
            </a>
            <p>Researched, fact-checked SEO articles, published to your site on autopilot. Free for 2 articles per month.</p>
          </div>
          <div className="foot-col">
            <h4>Product</h4>
            <a href={`${base}#features`}>Features</a>
            <a href="/pricing">Pricing</a>
            <a href={`${base}#faq`}>FAQ</a>
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
  );
}
