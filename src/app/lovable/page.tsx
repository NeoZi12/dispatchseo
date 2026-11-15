import type { Metadata } from "next";
import { Caveat, DM_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { CardMascot } from "@/components/card-mascot";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { FREE_ARTICLES_PER_MONTH, TIER_LIMITS, articlesPerMonthFor, priceLabel, type Tier } from "@/lib/billing";
import { BRAND_URL, brandJsonLdHtml } from "@/lib/brand";
import { DomainCta } from "../domain-cta";
import { SiteFooter } from "../site-footer";
import { SiteNav } from "../site-nav";
import "../landing.css";

// DispatchSEO for sites built with Lovable: the one page that answers "does it
// work with Lovable, and how" in full. The landing FAQ, /pricing, /about and
// llms.txt each say it in a sentence and link here.
//
// Written to be quoted: every claim is a plain sentence in the server-rendered
// HTML, the steps are also HowTo markup and the questions FAQPage markup, both
// built from the same strings the page shows. Each fact was checked on a real
// Lovable project (2026-11-14): one route file, one Publish click, articles
// live afterwards with no second click. If hosted-rewrite.ts changes what a
// Lovable site gets, this page changes with it.
//
// Cloud only, like the landing page and /pricing: a self-hosted install has no
// hosted blog to offer. Public in src/proxy.ts under LANDING_ENABLED.

export const dynamic = "force-dynamic";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm" });
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--font-hand" });

const TIERS: Tier[] = ["starter", "growth", "scale"];
const PAID_ARTICLES = TIERS.map((t) => articlesPerMonthFor(t));
const FROM_PRICE = priceLabel(TIER_LIMITS.starter.price);

export const metadata: Metadata = {
  title: "SEO for Lovable sites: automatic blog articles | DispatchSEO",
  description: `DispatchSEO adds a blog to your Lovable site and fills it with researched, fact-checked SEO articles. Connect the project's GitHub repo, press Publish in Lovable once, and every article goes live on its own. Free for ${FREE_ARTICLES_PER_MONTH} articles a month.`,
  alternates: { canonical: "/lovable" },
};

// The setup, in the order it happens. Rendered as the step cards and as HowTo
// markup, from these strings.
const STEPS: { name: string; text: string }[] = [
  {
    name: "Connect your project to GitHub",
    text: "In Lovable, connect the project to GitHub. Lovable keeps a repository in step with your project, and that repository is what DispatchSEO talks to.",
  },
  {
    name: "Set up DispatchSEO",
    text: "Type your site's address, sign in with Google and pick the repository. Setup checks the project right there and tells you if it can't publish to it.",
  },
  {
    name: "Press Publish in Lovable once",
    text: "Setup adds one small file to the repository. It tells your app to show a blog at yoursite.com/blog. Your dashboard asks you to press Publish in Lovable, and that is the only time.",
  },
  {
    name: "Articles go live on their own",
    text: "DispatchSEO finds topics people search for, writes each article, checks its facts and publishes it to your blog. You don't press Publish again.",
  },
];

// What a Lovable site gets, as a table a reader (or a crawler) can lift a
// single row from.
function facts(): { label: string; value: string }[] {
  return [
    { label: "Works with", value: "Lovable projects on Lovable's current setup: made, or upgraded in Lovable, since May 2026. Lovable's free plan is enough." },
    { label: "Blog address", value: "yoursite.com/blog, under your own address. If your app already has a page at /blog, the articles go to yoursite.com/articles." },
    { label: "Added to your project", value: "One route file, through the project's GitHub repository." },
    { label: "Publish clicks in Lovable", value: "One, during setup." },
    { label: "Lovable credits used", value: "None." },
    { label: "Each article", value: "Written for a keyword with real search demand, fact-checked, and published with a cover picture." },
    { label: "Google", value: "Setup confirms your site with Google Search Console, and the blog has its own sitemap." },
    { label: "Look", value: "Your site's colour and logo, in a clean reading layout." },
    { label: "Price", value: `Free for ${FREE_ARTICLES_PER_MONTH} articles a month, with no card. Paid plans start at ${FROM_PRICE} a month.` },
    { label: "To remove it", value: "Delete the one file and press Publish in Lovable." },
  ];
}

// The questions a Lovable owner asks, answered in plain sentences. Plain
// strings on purpose: the same text renders on the page and in the FAQPage
// markup, so the two can never say different things.
function lovableFaq(): { q: string; a: string }[] {
  return [
    {
      q: "Does DispatchSEO work with Lovable sites?",
      a: "Yes. DispatchSEO works with websites built in Lovable. You connect the Lovable project's GitHub repository during setup and press Publish in Lovable once. After that, DispatchSEO researches, writes and publishes SEO articles to your site's blog on its own.",
    },
    {
      q: "How do I add a blog to my Lovable site?",
      a: "Connect your Lovable project to GitHub, then set up DispatchSEO with your site's address. Setup adds one file to the repository that shows a blog at yoursite.com/blog. Press Publish in Lovable once and the blog is live. DispatchSEO then writes the articles and publishes them for you.",
    },
    {
      q: "Do I have to press Publish in Lovable for every article?",
      a: "No. You press Publish once, during setup. Your app fetches the articles from DispatchSEO when someone opens the blog, so a new article needs no change to your Lovable project and no new Publish.",
    },
    {
      q: "Does it use my Lovable credits?",
      a: "No. DispatchSEO doesn't use Lovable's AI and never sends prompts to your project. The one file it adds reaches your project through GitHub.",
    },
    {
      q: "Do I need a paid Lovable plan?",
      a: "No. Lovable's free plan can connect a project to GitHub and publish it, and that is all the setup needs.",
    },
    {
      q: "My Lovable project is older. Will it work?",
      a: "A project made before May 2026 runs on Lovable's older setup, which can't show the blog. Lovable can upgrade the project in place, and it charges credits for that. Setup checks your project at the GitHub step and tells you if it needs the upgrade, before anything is written.",
    },
    {
      q: "Where do the articles appear?",
      a: "At yoursite.com/blog, under your own address. If your app already has a page at /blog, the articles go to yoursite.com/articles and your page stays as it is.",
    },
    {
      q: "Does it work on my own domain?",
      a: "The blog is a route inside your published app, so it shows at the address your app is published on: a lovable.app address, or a domain you connected in Lovable.",
    },
    {
      q: "Can Google and ChatGPT read the articles?",
      a: "Yes. Each article arrives from your own address as a complete HTML page, so a crawler reads it without running any JavaScript. The blog has a sitemap, and setup confirms your site with Google Search Console.",
    },
    {
      q: "Will the blog look like my site?",
      a: "It uses your site's colour and logo, in its own reading layout. It doesn't copy your app's header and footer.",
    },
    {
      q: "What does it cost?",
      a: `DispatchSEO is free for ${FREE_ARTICLES_PER_MONTH} articles a month on one website, with no card and no end date. Free articles carry a small DispatchSEO badge. Paid plans publish ${PAID_ARTICLES[0]}, ${PAID_ARTICLES[1]} or ${PAID_ARTICLES[2]} articles a month without the badge, starting at ${FROM_PRICE} a month.`,
    },
    {
      q: "Can I remove it later?",
      a: "Yes. Delete the one file setup added to your repository and press Publish in Lovable. Your app is back to how it was.",
    },
    {
      q: "Is DispatchSEO made by Lovable?",
      a: "No. DispatchSEO is an independent, open-source product. It is not affiliated with Lovable.",
    },
  ];
}

// "<" escaped so no string can ever close the script tag.
function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function pageJsonLdHtml(faq: { q: string; a: string }[]): string {
  return jsonLd({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FAQPage",
        "@id": `${BRAND_URL}/lovable#faq`,
        mainEntity: faq.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
      {
        "@type": "HowTo",
        "@id": `${BRAND_URL}/lovable#setup`,
        name: "How to add an SEO blog to a Lovable site with DispatchSEO",
        step: STEPS.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.name, text: s.text })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "DispatchSEO", item: BRAND_URL },
          { "@type": "ListItem", position: 2, name: "SEO for Lovable sites", item: `${BRAND_URL}/lovable` },
        ],
      },
    ],
  });
}

export default function LovablePage() {
  if (process.env.LANDING_ENABLED !== "true") redirect("/dashboard");

  const faq = lovableFaq();

  return (
    <>
      <SiteNav />
      <div className={`ld ${jakarta.variable} ${dmSans.variable} ${caveat.variable}`}>
        {/* The same Organization + SoftwareApplication graph as the landing
            page (lib/brand.ts), plus this page's steps and questions. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: brandJsonLdHtml() }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: pageJsonLdHtml(faq) }} />

        <header className="lv-hero">
          <div className="wrap">
            <h1>SEO for Lovable sites, on autopilot</h1>
            <p className="lv-sub">
              DispatchSEO adds a blog to your Lovable site and fills it with researched, fact-checked articles. You
              press Publish in Lovable once. After that, every article goes live on its own.
            </p>
            <div className="cta-row">
              <DomainCta />
            </div>
          </div>
        </header>

        <section className="band-alt" id="how">
          <div className="wrap">
            <div className="sec-h">
              <h2>How it works on a Lovable site</h2>
            </div>
            <ol className="steps lv-steps">
              {STEPS.map((s, i) => (
                <li className="step" key={s.name}>
                  <span className="num" aria-hidden="true">{i + 1}</span>
                  <h3>{s.name}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="what-you-get">
          <div className="wrap">
            <div className="sec-h">
              <h2>What your Lovable site gets</h2>
            </div>
            <div className="pr-table-wrap lv-facts-wrap">
              <table className="lv-facts">
                <tbody>
                  {facts().map((f) => (
                    <tr key={f.label}>
                      <th scope="row">{f.label}</th>
                      <td>{f.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="band-alt" id="why">
          <div className="wrap">
            <div className="sec-h">
              <h2>Why one Publish click is enough</h2>
            </div>
            <div className="lv-prose">
              <p>
                A change pushed to a Lovable project&apos;s GitHub repository does not reach the live site until someone
                presses Publish in Lovable. A tool that writes each article into your repository therefore leaves every
                article waiting for a click.
              </p>
              <p>
                DispatchSEO keeps the articles on its side. The one file it adds tells your app to fetch the blog from
                DispatchSEO whenever a visitor or a search engine opens it. A new article shows up at your own address
                the moment it is ready, with nothing new to publish in Lovable.
              </p>
              <p>
                Your Lovable project stays small, too. The articles never enter it, so they don&apos;t use credits and
                they don&apos;t get in the way when you edit your site with prompts.
              </p>
            </div>
          </div>
        </section>

        <section className="faq" id="faq">
          <div className="wrap">
            <div className="sec-h">
              <h2>Lovable questions</h2>
            </div>
            <div className="faq-list">
              {faq.map(({ q, a }, i) => (
                <details key={q} open={i === 0}>
                  <summary>{q}</summary>
                  <div className="a">
                    {a}
                    {q === "What does it cost?" ? <> Every plan is on the <a href="/pricing">pricing page</a>.</> : null}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="final">
          <div className="wrap">
            <h2>Give your Lovable site a blog.<span className="caret" /></h2>
            <p>{FREE_ARTICLES_PER_MONTH} articles per month, researched, fact-checked and published for you. No card.</p>
            <div className="cta-row">
              <span className="final-cta-wrap">
                <CardMascot className="cta-mascot" />
                <a className="btn btn-solid" href="/onboarding">Get free traffic</a>
              </span>
            </div>
            <p className="lv-fine">Lovable is a trademark of its owner. DispatchSEO is an independent product and is not affiliated with Lovable.</p>
          </div>
        </section>

        <SiteFooter />

        <a className="discord-float" href={DISCORD_URL} target="_blank" rel="noreferrer" aria-label="Discord support">
          <DiscordMark className="dc-mark" />
          <span className="dc-label">Discord support</span>
        </a>
      </div>
    </>
  );
}
