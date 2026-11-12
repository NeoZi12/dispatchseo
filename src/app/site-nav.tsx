import { DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { DispatchMark } from "@/components/logo";
import { LandingNav } from "./landing-nav";
import { CtaChevrons } from "./cta-chevrons";
import "./landing.css";

// The landing page's nav bar, for public pages that are NOT the landing
// (the blog index, every post and /pricing). Same markup and the same .ld-scoped
// CSS, so it is pixel-identical to the bar on "/" - the reader lands on a
// post from Google, sees the same chrome, and the way home or to pricing is
// obvious. Links are absolute ("/pricing", "/#faq") because they must work from
// any path; the landing's own copy (page.tsx, agent-landing.tsx) uses bare
// anchors and is unchanged.
//
// The wrapper itself is the sticky element (.ld.site-nav): a sticky <nav>
// inside a nav-high wrapper would stop sticking the moment the wrapper
// scrolled off, and the .ld root is also where LandingNav portals its sheet.

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });

const GITHUB_URL = "https://github.com/NeoZi12/dispatchseo";
const DOCS_URL = "/docs";
const LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
];

export function SiteNav() {
  return (
    <div className={`ld site-nav ${jakarta.variable} ${dmSans.variable}`}>
      <nav>
        <div className="nav-wrap nav-in">
          <a className="logo" href="/">
            <DispatchMark className="logo-mark" />
            DispatchSEO
          </a>
          <div className="nav-links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </div>
          <div className="nav-cta">
            <a className="btn btn-ghost btn-sm" href="/login">Log in</a>
            <a className="btn btn-solid btn-sm" href="/signup">Start for free<CtaChevrons /></a>
          </div>
          <LandingNav githubUrl={GITHUB_URL} docsUrl={DOCS_URL} links={LINKS} />
        </div>
      </nav>
    </div>
  );
}
