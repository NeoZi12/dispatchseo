import { TIER_LIMITS, articlesPerMonthFor, type Tier } from "./billing";

// The one description of DispatchSEO that every public surface repeats
// verbatim: the landing page's JSON-LD, /about, /llms.txt, the README header
// and the directory listings the owner maintains by hand (AlternativeTo,
// Product Hunt, Peerlist, LinkedIn, Crunchbase). AI answer engines build
// their picture of a product from how consistently the web describes it;
// on 2026-11-09 three of our surfaces described three different products
// (the pre-pivot "backend for your coding agent", the Git-only tool, and the
// free autopilot), which is the one thing they punish. Change this text and
// the hand-maintained listings together - never one without the other.

export const BRAND_NAME = "DispatchSEO";
export const BRAND_URL = "https://dispatchseo.com";

export const BRAND_TAGLINE = "Free SEO automation: researched articles, published to your site on autopilot.";

export const BRAND_DESCRIPTION =
  "DispatchSEO is a free SEO autopilot for small websites. It researches keywords with real search demand, writes fact-checked articles and publishes them to your site for you, as pull requests to your GitHub repo or on a hosted blog, then shows the Google visitors they bring. Two articles per month are free, with no card. Paid plans publish 4, 12 or 20 articles per month.";

export const BRAND_SAME_AS = [
  "https://github.com/NeoZi12/dispatchseo",
  "https://alternativeto.net/software/dispatchseo/",
  "https://www.producthunt.com/products/dispatchseo",
];

const TIER_NAMES: Record<Tier, string> = { starter: "Starter", growth: "Growth", scale: "Scale" };

// Organization + SoftwareApplication, one graph. Prices come from TIER_LIMITS
// so the markup can never disagree with the plan cards. Google says
// structured data is optional for its AI features; it is here for rich
// results and so a crawler gets the name, the price list and the free tier
// as facts rather than prose.
export function brandJsonLd(): Record<string, unknown> {
  const offers = [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      description: "2 fact-checked articles per month, published for you, with your Google stats. No card.",
    },
    ...(Object.keys(TIER_LIMITS) as Tier[]).map((tier) => ({
      "@type": "Offer",
      name: TIER_NAMES[tier],
      price: String(TIER_LIMITS[tier].price),
      priceCurrency: "USD",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: String(TIER_LIMITS[tier].price),
        priceCurrency: "USD",
        billingDuration: "P1M",
      },
      description: `${articlesPerMonthFor(tier)} articles per month, weekly keyword research, keyword rankings, no DispatchSEO badge.`,
    })),
  ];
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${BRAND_URL}/#organization`,
        name: BRAND_NAME,
        url: BRAND_URL,
        logo: `${BRAND_URL}/icon.png`,
        description: BRAND_DESCRIPTION,
        sameAs: BRAND_SAME_AS,
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${BRAND_URL}/#software`,
        name: BRAND_NAME,
        url: BRAND_URL,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "SEO automation",
        operatingSystem: "Web",
        description: BRAND_DESCRIPTION,
        publisher: { "@id": `${BRAND_URL}/#organization` },
        offers,
        featureList: [
          "Keyword research from real search demand and your Search Console data",
          "Fact-checked articles written and published for you, weekly or twice a month",
          "Publishes as pull requests to a GitHub repository or to a hosted blog",
          "Google Search Console clicks and impressions per article",
          "Keyword rank tracking on paid plans",
          "Open source (AGPL-3.0), self-hostable, with an MCP server for coding agents",
        ],
      },
    ],
  };
}

// Serialised for a <script type="application/ld+json">; "<" escaped so no
// string in the graph can ever close the tag.
export function brandJsonLdHtml(): string {
  return JSON.stringify(brandJsonLd()).replace(/</g, "\\u003c");
}
