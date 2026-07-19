import type { PlaybookItem } from "./playbook";

// Curated lists - researched fresh and every submitUrl fetched live on
// 2026-07-13. Free list ordered by value for a dev-tool product; paid list
// ordered by ROI. Link types are platform-stated or from the Feb 2026
// crowd-audited Startup-Launch-List dataset where noted "reported".
// Re-verify periodically: directories die, paywall, and reprice constantly
// (TAAFT/Futurepedia/Toolify all paywalled their listings; StackShare is
// effectively dead since the FOSSA acquisition).

export const PLAYBOOK_RESEARCHED = "2026-07-13";

export const FREE_BACKLINKS: PlaybookItem[] = [
  {
    slug: "uneed",
    name: "Uneed",
    kind: "free",
    price: null,
    url: "https://www.uneed.best",
    submitUrl: "https://www.uneed.best/submit-a-tool",
    linkType: "dofollow",
    worth:
      "The best free dofollow link available right now - Uneed itself advertises a dofollow backlink from a DR 75 site, plus a real launch-day audience of founders and indie hackers.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Product URL", from: "url" },
      { label: "Tagline", from: "tagline" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Open the submit page and enter your product name and URL - their bot scrapes your site and prefills the rest.",
      "Create the free account when prompted to save the draft.",
      "Fix up the scraped tagline, description, images, and categories with the copy below.",
      "Pick the free 'Join the line' option - you get the next available launch slot automatically.",
      "On launch day, share the link with a few users so early upvotes land organically.",
    ],
    notes:
      "The free queue is typically a few weeks out (paying $29.99 only buys a specific date, not a better link). Moderation is strict about fake upvotes - never buy votes.",
  },
  {
    slug: "awesome-claude-code",
    name: "awesome-claude-code (GitHub PR)",
    kind: "free",
    price: null,
    url: "https://github.com/hesreallyhim/awesome-claude-code",
    submitUrl: "https://github.com/hesreallyhim/awesome-claude-code",
    linkType: "nofollow",
    worth:
      "The most audience-exact placement possible for a Claude Code product: a 49k-star list that Claude Code users actually browse. Nofollow, but the referral traffic and AI-crawler citations are real.",
    effortMins: 30,
    requiresAccount: true,
    fields: [
      {
        label: "List entry line",
        value: "[{name}]({url}) - {tagline}.",
      },
    ],
    steps: [
      "Read the repo's CONTRIBUTING file first - it has an automated submission workflow and strict category conventions.",
      "Lead with your free, genuinely useful surface (a tips library, a free tool), not the paywall - curated lists reject bare product plugs.",
      "Fork, add your entry line in the right category, and open the PR.",
      "Expect days-to-weeks for review (the repo has a long queue) - do not bump the PR.",
    ],
    notes:
      "Curation is real: if the maintainer sees a pure ad, it gets closed. Position the entry around what readers get for free.",
  },
  {
    slug: "devhunt",
    name: "Dev Hunt",
    kind: "free",
    price: null,
    url: "https://devhunt.org",
    submitUrl: "https://devhunt.org",
    linkType: "nofollow",
    worth:
      "A launch platform that is 100% developers - far less competition than Product Hunt and a much better conversion fit for a dev tool. Link is reported nofollow; the audience is the point.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Tool name", from: "name" },
      { label: "Website URL", from: "url" },
      { label: "Description", from: "short" },
      { label: "Category tags", from: "tags" },
    ],
    steps: [
      "Sign in with GitHub (that's the only auth - no separate registration).",
      "Click 'Submit your Dev Tool' and fill the form with the copy below.",
      "Add a logo and a screenshot - listings with images perform visibly better in the weekly vote.",
      "Top tools of the week get featured in their newsletter - share your listing with users early in the cycle.",
    ],
    notes: "Dev tools only - which is exactly why the audience converts for developer products.",
  },
  {
    slug: "product-hunt",
    name: "Product Hunt",
    kind: "free",
    price: null,
    url: "https://www.producthunt.com",
    submitUrl: "https://www.producthunt.com/posts/new",
    linkType: "nofollow",
    worth:
      "Nofollow links, but the biggest launch-day traffic on the internet, a permanent DR 91 listing, and strong brand-search presence. Worth one properly prepared launch.",
    effortMins: 60,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline (60 chars max)", from: "tagline" },
      { label: "Description", from: "short" },
      { label: "Topics", from: "categories" },
      {
        label: "First comment (maker intro)",
        value:
          "Hey Product Hunt! I built {name} because setting this up by hand takes months of trial and error. {short} Happy to answer anything about how it works.",
      },
    ],
    steps: [
      "Create your account well before launching - fresh accounts launching same-day look spammy.",
      "Prepare assets first: logo (240x240), at least one gallery image (1270x760), and the copy below.",
      "Schedule the launch for 12:01am Pacific on a weekday you can be online all day.",
      "Post the maker comment immediately after going live, and reply to every comment that day.",
      "Tell your users the morning of - votes must arrive organically through the day, never in a burst.",
    ],
    notes:
      "You get one real shot per major version. Vote-buying or vote-swapping gets launches killed. Weekdays are more competitive but worth far more.",
  },
  {
    slug: "peerlist",
    name: "Peerlist Launchpad",
    kind: "free",
    price: null,
    url: "https://peerlist.io/launchpad",
    submitUrl: "https://peerlist.io/user/projects/add-project",
    linkType: "unverified",
    worth:
      "Developer-and-designer audience with a weekly launch leaderboard; project pages are SEO-indexed on a DR ~76 domain with real traffic.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "Project name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Project URL", from: "url" },
      { label: "Category", from: "categories" },
      { label: "Description", from: "long" },
    ],
    steps: [
      "Create a personal Peerlist profile with your real name and photo - company profiles cannot launch.",
      "Add the project from your profile with the copy below, up to 4 cover images, and the tech stack.",
      "Mark the project 100% complete - incomplete projects silently fail launch eligibility.",
      "Launch it from the Launchpad - windows open every Monday and run for the week; you can schedule ahead.",
    ],
    notes: "Weekly Monday cadence; the first two days of each window show launches in randomized order.",
  },
  {
    slug: "alternativeto",
    name: "AlternativeTo",
    kind: "free",
    price: null,
    url: "https://alternativeto.net",
    submitUrl: "https://alternativeto.net/manage-item/",
    linkType: "nofollow",
    worth:
      "Ranks hard for '[competitor] alternative' searches - an evergreen listing that keeps sending qualified visitors long after launch platforms go quiet. Reported nofollow; the search visibility is the value.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "App name", from: "name" },
      { label: "URL", from: "url" },
      { label: "Description", from: "short" },
      { label: "Tags", from: "tags" },
      {
        label: "Alternative-to mappings",
        value:
          "List 2-3 established products people already search for that {name} genuinely competes with or complements - the mappings are what make the listing rank.",
      },
    ],
    steps: [
      "Sign up (email or Google/GitHub) and open 'Add application' from the manage page.",
      "Fill the form with the copy below, plus an icon and 1-2 screenshots.",
      "The 'alternative to' mappings matter most - pick real comparables, not aspirational giants.",
      "Wait for moderator review, typically 1-3 days; new accounts need approval per submission.",
    ],
    notes: "Moderators reject thin or misleading listings - honest positioning gets through.",
  },
  {
    slug: "saashub",
    name: "SaaSHub",
    kind: "free",
    price: null,
    url: "https://www.saashub.com",
    submitUrl: "https://www.saashub.com/services/new",
    linkType: "dofollow",
    worth:
      "Free listing on a DR ~79 domain whose '[product] alternatives' pages rank well; verified listings reportedly carry the dofollow link. Do NOT pay for Featured - the link is in the free tier.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Website URL", from: "url" },
      { label: "Description", from: "short" },
      { label: "Categories", from: "categories" },
      {
        label: "Competitors",
        value:
          "List 3-5 comparable products - submissions without competitors are deprioritized to the bottom of the review queue.",
      },
    ],
    steps: [
      "Submit at services/new (not /submit, which is their paid multi-directory promo tool).",
      "Verify the listing with an email on your product's own domain - that gets priority review and the verified badge.",
      "Add competitors - their review queue explicitly deprioritizes listings without them.",
      "If you submitted in the past, claim and verify the existing listing instead of resubmitting.",
    ],
    notes:
      "Rules: no pre-launch products, no free-subdomain sites, English only. Skip the $99/mo Featured upsell - it buys promo placement, not a better link.",
  },
  {
    slug: "crunchbase",
    name: "Crunchbase",
    kind: "free",
    price: null,
    url: "https://www.crunchbase.com",
    submitUrl: "https://www.crunchbase.com/add-new",
    linkType: "nofollow",
    worth:
      "DR 91 profile that owns part of your brand SERP and gets cited constantly by AI answer engines. Nofollow link - this is an entity/credibility play, not link equity. Never pay for Pro for link reasons.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "Company name", from: "name" },
      { label: "Website", from: "url" },
      { label: "Short description", from: "tagline" },
      { label: "Long description", from: "long" },
      { label: "Industries (3-5)", from: "categories" },
    ],
    steps: [
      "Create an account and connect LinkedIn or Google - social authentication is required before you can add profiles.",
      "Add the company profile with the copy below, logo, founded date, and founder info.",
      "Fill industries (3-5) - thin profiles get removed by moderation.",
      "Wait for the moderation queue, typically a few days.",
    ],
    notes: "Free profile creation covers everything link-related - Crunchbase Pro changes nothing about the profile or its link.",
  },
  {
    slug: "g2",
    name: "G2",
    kind: "free",
    price: null,
    url: "https://www.g2.com",
    submitUrl: "https://sell.g2.com/claim-your-profile",
    linkType: "nofollow",
    worth:
      "DR 91 review platform that ranks for '[product] reviews' and is quoted heavily by ChatGPT and Perplexity. The trust surface for a paid product - not a link-equity play.",
    effortMins: 25,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Category", from: "categories" },
      { label: "Description", from: "long" },
    ],
    steps: [
      "Start the 'claim your profile' flow and pick 'not on G2 yet' to create the listing.",
      "Expect business-email verification on your product's domain.",
      "Fill the profile with the copy below, logo, screenshots, and pricing info.",
      "After it's live, ask 3-5 real users for honest reviews - a zero-review profile can look worse than none.",
    ],
    notes: "Category placement is reviewed by G2, so pick the closest real category rather than inventing one.",
  },
  {
    slug: "capterra",
    name: "Capterra (G2 Digital Markets)",
    kind: "free",
    price: null,
    url: "https://www.capterra.com",
    submitUrl: "https://app.g2digitalmarkets.com/get-listed/start",
    linkType: "nofollow",
    worth:
      "One free submission now covers the Capterra + GetApp + Software Advice family (G2 acquired all three from Gartner in Feb 2026). DR ~91 review-site trust surface.",
    effortMins: 25,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Category", from: "categories" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Use the g2digitalmarkets.com get-listed flow (older guides pointing at Gartner Digital Markets URLs are stale).",
      "Create the vendor account and expect business verification.",
      "Fill product details, features checklist, screenshots, and pricing with the copy below.",
      "Review typically takes 1-2 weeks.",
    ],
    notes: "The free listing is enough - PPC lead-gen upsells are optional and separate.",
  },
  {
    slug: "hacker-news",
    name: "Hacker News (Show HN)",
    kind: "free",
    price: null,
    url: "https://news.ycombinator.com",
    submitUrl: "https://news.ycombinator.com/submit",
    linkType: "nofollow",
    worth:
      "The single biggest potential traffic day for a dev tool if it lands, and one of the most AI-cited sites on the internet. Zero link equity - pure traffic and credibility.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "Title (80 chars max)", value: "Show HN: {name} - {tagline}" },
      { label: "URL", from: "url" },
    ],
    steps: [
      "Create the account ahead of time (free, instant).",
      "Read the Show HN rules first - readers must be able to actually try something.",
      "Submit with the title below; lead with your free surface so commenters have something to poke at.",
      "Be online for the first 3-4 hours to answer comments honestly - HN rewards candor and punishes marketing-speak.",
    ],
    notes:
      "Never solicit upvotes - HN's voting-ring detection kills posts. A paywalled product can draw friction in comments; front the free value.",
  },
  {
    slug: "devto",
    name: "dev.to article",
    kind: "free",
    price: null,
    url: "https://dev.to",
    submitUrl: "https://dev.to/enter",
    linkType: "mixed",
    worth:
      "DR 90 blogging community with 1.4M monthly readers. A genuine 'how I set this up' tutorial with your byline link reaches developers directly and gets indexed fast.",
    effortMins: 90,
    requiresAccount: true,
    fields: [
      {
        label: "Suggested article angle",
        value:
          "A practical, value-first tutorial in your product's domain (what problem it solves, shown step by step) that mentions {name} naturally once - not an ad.",
      },
      { label: "Profile website field", from: "url" },
    ],
    steps: [
      "Sign up (GitHub OAuth is fastest) and set your profile website to your product URL.",
      "Write a genuinely useful tutorial - overtly promotional posts get downranked and flagged.",
      "If you republish a post from your own blog, set the canonical_url so Google credits your site.",
      "Use up to 4 relevant tags and a cover image; publish - it's live instantly.",
    ],
    notes: "This one costs real writing time, but a good post keeps referring developers for months.",
  },
  {
    slug: "indie-hackers",
    name: "Indie Hackers",
    kind: "free",
    price: null,
    url: "https://www.indiehackers.com",
    submitUrl: "https://www.indiehackers.com/products/new",
    linkType: "unverified",
    worth:
      "DR ~81 product page plus a community where honest build-and-revenue stories outperform any ad. The product page alone does little - participation is the value.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Website URL", from: "url" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Create the free account and add the product with the copy below.",
      "Optionally connect Stripe to show verified revenue - IH readers trust numbers.",
      "Post a milestone or lessons-learned story within the first week - that's what actually gets read.",
    ],
    notes: "The community is allergic to drive-by promotion; a listing without participation is a dead page.",
  },
  {
    slug: "microlaunch-free",
    name: "Microlaunch (free queue)",
    kind: "free",
    price: null,
    url: "https://microlaunch.net",
    submitUrl: "https://microlaunch.net/submit",
    linkType: "unverified",
    worth:
      "Month-long launch exposure to an indie/maker audience instead of a one-day spike. Free tier joins the monthly queue; the stated 'DR 60+ dofollow' claim is for the paid tier, so treat the free link type as unverified.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Product URL", from: "url" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Sign up free and ignore the Pro upsell on the submit page - a free queue launch exists after signup.",
      "Fill the listing with the copy below plus images.",
      "You get queued into a monthly cohort; the leaderboard runs all month, so engagement any week counts.",
    ],
    notes: "Free queue timing is not in your control; the submit page is deliberately salesy about the $49 Pro tier.",
  },
  {
    slug: "startup-fame",
    name: "Startup Fame",
    kind: "free",
    price: null,
    url: "https://startupfa.me",
    submitUrl: "https://startupfa.me",
    linkType: "dofollow",
    worth:
      "One of the highest-DR free dofollow claims live right now (DR ~82, platform-stated) - but the free tier requires their verification badge on your homepage, a reciprocal link. Decide if that trade is acceptable.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Website URL", from: "url" },
      { label: "Name (edit after AI prefill)", from: "name" },
      { label: "Description (edit after AI prefill)", from: "short" },
      { label: "Categories", from: "categories" },
    ],
    steps: [
      "Create a free account from the homepage 'Submit your startup' (there is no direct /submit URL).",
      "Enter your URL - their AI fetches and prefills the listing; correct it with the copy below.",
      "To get featured free, add their verification badge to your homepage or footer.",
      "Quality review takes several business days.",
    ],
    notes:
      "RECIPROCAL: the free dofollow requires hosting their badge (a link back to them) on your site - a link exchange, which Google discounts and, done at scale, names as link spam. One badge is harmless; don't collect them. Do it for the listing, not the link.",
  },
  {
    slug: "tinylaunch",
    name: "TinyLaunch",
    kind: "free",
    price: null,
    url: "https://www.tinylaunch.com",
    submitUrl: "https://www.tinylaunch.com/submit",
    linkType: "dofollow",
    worth:
      "Fast, low-effort listing with a stated dofollow from a DR ~72 domain - but the dofollow is granted only when you embed their badge with a dofollow link back. Reciprocal trade, same call as Startup Fame.",
    effortMins: 10,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Category", from: "categories" },
      { label: "URL", from: "url" },
    ],
    steps: [
      "Sign in (email, Google, GitHub, or X) and submit with the copy below.",
      "Listing goes live near-immediately into the daily launch period.",
      "To activate the dofollow, embed their badge on your landing page with a dofollow link to tinylaunch.com.",
    ],
    notes:
      "RECIPROCAL: dofollow is badge-for-link - a link exchange Google discounts, so do it for the listing and launch-day eyeballs, not the link. Top 3 daily products get an extra badge.",
  },
  {
    slug: "launching-next",
    name: "Launching Next",
    kind: "free",
    price: null,
    url: "https://www.launchingnext.com",
    submitUrl: "https://www.launchingnext.com/submit/",
    linkType: "unverified",
    worth:
      "The fastest submission on this list - an open form, no account needed, five minutes. Modest authority; a good queue-filler while bigger submissions pend.",
    effortMins: 5,
    requiresAccount: false,
    fields: [
      { label: "Startup name", from: "name" },
      { label: "Startup URL", from: "url" },
      { label: "Headline (5-8 words)", from: "tagline" },
      { label: "Full description (2,500 chars max)", from: "long" },
      { label: "Tags (5-10, comma-separated)", from: "tags" },
      { label: "Classification", value: "Bootstrapped" },
    ],
    steps: [
      "Open the form - no account needed.",
      "Paste the copy below into the matching fields and answer the simple captcha.",
      "Submissions are reviewed daily; you only get an email if published.",
    ],
    notes: "Publication is not guaranteed and rejections are silent. Expect ad upsell emails to the address you give.",
  },
  {
    slug: "fazier-free",
    name: "Fazier (free tier)",
    kind: "free",
    price: null,
    url: "https://fazier.com",
    submitUrl: "https://fazier.com/submit",
    linkType: "nofollow",
    worth:
      "Legit, active launch platform on a DR ~80 domain - but the free tier requires a link back to Fazier on your homepage or footer, and the free link is likely nofollow (their paid tier is what sells the dofollow). Last resort of the free list.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Description", from: "short" },
      { label: "Category", from: "categories" },
    ],
    steps: [
      "Sign up and submit the listing with the copy below plus logo and images.",
      "Free Basic tier is reviewed and listed within about 15 days.",
      "The free tier requires adding a Fazier badge/link to your homepage or footer - decide if that's acceptable before submitting.",
    ],
    notes:
      "RECIPROCAL: free tier requires a backlink to Fazier on your site - a link exchange Google discounts. If you'd rather not, their $39 Premium (see paid list) drops the badge requirement - judge that on launch exposure, not the link.",
  },
];

// The rule for every paid item: money buys VISIBILITY - launch exposure,
// audience, directory presence - never rankings. Google's link-spam policy
// names purchased dofollow links, and in practice it devalues exactly that
// pattern, so any advertised dofollow is priced at zero in the copy below
// and the item has to justify its price without it.
export const PAID_BACKLINKS: PlaybookItem[] = [
  {
    slug: "uneed-skip",
    name: "Uneed - Skip the Line",
    kind: "paid",
    price: "$29.99 one-time",
    url: "https://www.uneed.best",
    submitUrl: "https://www.uneed.best/pricing",
    linkType: "dofollow",
    worth:
      "Best value on the paid list because the dofollow link itself is FREE (see the free list) - this only buys your choice of launch date. Pay it only if timing matters to you.",
    effortMins: 5,
    requiresAccount: true,
    fields: [],
    steps: [
      "Complete the free Uneed submission first (see the free list).",
      "At the queue step, pay Skip the Line to pick your exact launch date instead of the next open slot.",
    ],
    notes: "Same listing, same link - the $29.99 is purely scheduling. Their $147 newsletter slot (19k subs) is the cheapest legit dev-adjacent newsletter test if you want one.",
  },
  {
    slug: "fazier-premium",
    name: "Fazier - Premium launch",
    kind: "paid",
    price: "$39 one-time",
    url: "https://fazier.com",
    submitUrl: "https://fazier.com/submit",
    linkType: "dofollow",
    worth:
      "Instant launch on an active high-DR (~82, stated) launch platform: 15 days of promotion and none of the free tier's badge-embed requirement. It advertises a permanent dofollow - price that at zero (buying links for rank is Google's link-spam definition, and purchased directory dofollows get devalued anyway) and judge the $39 on the launch exposure alone.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Description", from: "short" },
      { label: "Category", from: "categories" },
    ],
    steps: [
      "Sign up, choose the Premium ($39) tier on the submit flow.",
      "Fill the listing with the copy below; launch instantly or schedule.",
      "You get a premium badge and 15 days of cross-platform promotion; no link back to Fazier required.",
    ],
    notes: "Ignore the perpetual 'discount from $59' framing - $39 is the standing price. Skip their 100+ directories submission upsell entirely (see Do not buy).",
  },
  {
    slug: "microlaunch-pro",
    name: "Microlaunch - Pro launch",
    kind: "paid",
    price: "$49 one-time ($39 with code LAUNCH20)",
    url: "https://microlaunch.net",
    submitUrl: "https://microlaunch.net/premium",
    linkType: "dofollow",
    worth:
      "Featured spots, a 2x vote boost, and a maker audience close to a dev-tool's ICP - a fair exposure buy for the price of lunch. It also advertises 'DR 60+ dofollow' links: price those at zero (paid dofollow is the exact pattern Google devalues) and judge the $49 on the audience alone.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Product name", from: "name" },
      { label: "Tagline", from: "tagline" },
      { label: "Product URL", from: "url" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Sign up and choose Pro Launch on the premium page (try code LAUNCH20 for $10 off).",
      "Fill the listing with the copy below; you skip the monthly queue and launch immediately.",
      "You get 30 days of exposure and unlimited relaunches for major releases - use one when you ship something big.",
    ],
    notes: "Their self-reported traffic stats were last updated Nov 2025 - treat reach claims with a grain of salt. Skip the $129 'review & action plan' upsell (consulting, not placement).",
  },
  {
    slug: "taaft",
    name: "There's An AI For That (TAAFT)",
    kind: "paid",
    price: "$49 one-time",
    url: "https://theresanaiforthat.com",
    submitUrl: "https://theresanaiforthat.com/submit/",
    linkType: "unverified",
    worth:
      "The largest AI-tools directory - a permanent listing is table stakes for an AI product, and smaller directories scrape TAAFT's data, so one listing propagates. Link type unverified (historically redirect-wrapped); buy it for presence, not PageRank.",
    effortMins: 15,
    requiresAccount: true,
    fields: [
      { label: "Tool name", from: "name" },
      { label: "Website URL", from: "url" },
      { label: "Description", from: "short" },
      { label: "Category / use case", from: "categories" },
    ],
    steps: [
      "Choose the $49 'Website only' tier on the submit page - it includes the permanent listing and a $100 PPC credit.",
      "Fill the listing with the copy below.",
      "Skip the $347 'Everything' tier unless you want a launch-week traffic spike - its newsletter audience is broad AI consumers, not developers.",
    ],
    notes: "With 48k+ tools listed, an unfeatured listing gets a trickle of traffic - the value is permanence, credibility, and data propagation to smaller directories.",
  },
  {
    slug: "toolify",
    name: "Toolify.ai",
    kind: "paid",
    price: "$99 one-time",
    url: "https://www.toolify.ai",
    submitUrl: "https://www.toolify.ai/submit",
    linkType: "dofollow",
    worth:
      "A big multi-language AI directory - the $99 buys permanent presence in the ecosystem AI users (and smaller directories that scrape it) actually browse. Its headline pitch is '6+ dofollow links'; ignore that part - buying links for rank is Google's textbook link-spam definition, and purchased directory dofollows get devalued anyway. With almost no human referral traffic for a dev product, this is the last discretionary dollar on the list, not the first.",
    effortMins: 10,
    requiresAccount: true,
    fields: [
      { label: "Tool name", from: "name" },
      { label: "Website URL", from: "url" },
      { label: "Description", from: "short" },
    ],
    steps: [
      "Pay the $99 submission on the submit page - listed within 48 hours, no queue.",
      "Fill the listing with the copy below.",
      "You get a multi-language tool page plus 'Just Launched' placement.",
    ],
    notes:
      "IMPORTANT: the same page sells 'Guest Posts / Link Inserts' - do NOT buy those (textbook paid-link scheme, see Do not buy). Buy the listing only.",
  },
  {
    slug: "futurepedia",
    name: "Futurepedia - Verified Listing",
    kind: "paid",
    price: "$497 one-time",
    url: "https://www.futurepedia.io",
    submitUrl: "https://www.futurepedia.io/submit-tool",
    linkType: "unverified",
    worth:
      "Legitimate and refundable if editorially rejected, but 5-12x the price of everything above for an unverified link type and a broader, less developer-shaped audience. Only after items 1-5, if the budget exists.",
    effortMins: 20,
    requiresAccount: true,
    fields: [
      { label: "Tool name", from: "name" },
      { label: "Website URL", from: "url" },
      { label: "Description", from: "long" },
    ],
    steps: [
      "Submit via the submit-tool page; Verified Listing is $497 (the $247 Basic tier shows as sold out).",
      "Editorial approval is required - full refund if denied.",
      "Published within 2 business days once approved; add a demo video to the enhanced listing.",
    ],
    notes: "Notably, Futurepedia does not advertise dofollow anywhere - assume the link may be nofollow and price accordingly.",
  },
  {
    slug: "console-dev",
    name: "Console.dev newsletter sponsorship",
    kind: "paid",
    price: "Quote by email (dev newsletters run ~$1,000+ per slot)",
    url: "https://console.dev",
    submitUrl: "https://console.dev",
    linkType: "nofollow",
    worth:
      "The most audience-accurate paid placement for a dev tool - a devtools-review newsletter read by ~22k working developers. This is a customer-acquisition buy, not a link buy: judge it on conversions, never on SEO.",
    effortMins: 30,
    requiresAccount: false,
    fields: [
      {
        label: "Pitch email",
        value:
          "Hi - I run {name} ({url}). {short} I'd like a quote for a sponsorship slot; developers using AI coding tools are exactly your readers. What are your current rates and next available issues?",
      },
    ],
    steps: [
      "Email them via the contact on console.dev with the pitch below.",
      "Compare the quote against what a customer is worth to you - a slot needs real conversions to pay back.",
      "Archived issue pages keep a link on-site, but treat any SEO value as zero when deciding.",
    ],
    notes:
      "TLDR and Cooperpress (JavaScript Weekly etc.) are bigger but cost multi-thousands per slot and book out quarters ahead - only for a proven-converting offer.",
  },
];

// Rendered under the paid list. Buying these is how a backlink profile gets
// poisoned (see: the June 2026 spam blast that inflated a sister product's DR
// with 232 junk domains), not how DR grows.
export const DO_NOT_BUY: Array<{ name: string; reason: string }> = [
  {
    name: "'DR 50+ dofollow backlink' gigs (Fiverr, Legiit, SEO forums)",
    reason:
      "The DR is manufactured - those domains inflate each other with spam links and have zero real readers. You buy a vanity metric, a spam footprint, and a Google link-scheme penalty risk. Never worth it at any price.",
  },
  {
    name: "'Submit to 100+/500+ directories' blast services ($99-299, often upsold by legit platforms)",
    reason:
      "90%+ of those directories are zero-traffic clones scraping each other. A sudden burst of identical low-quality directory links is a spam footprint, not a strategy. Five curated listings beat five hundred junk ones.",
  },
  {
    name: "Guest-post and link-insertion marketplaces (including upsells on directory sites)",
    reason:
      "Paying to insert a dofollow link into existing editorial content is the textbook link scheme Google's spam updates target - the host sites are content farms that exist only to sell insertions, and they get deindexed in waves.",
  },
  {
    name: "SaaSHub Featured ($99/month)",
    reason:
      "The SEO asset - the dofollow listing - is already in SaaSHub's FREE tier. The monthly fee buys promo placement whose referral volume won't clear $99/mo for a niche dev tool.",
  },
  {
    name: "Crunchbase Pro ($49-99/month) 'for the link'",
    reason:
      "Pro is a research/prospecting subscription - it changes nothing about your company profile or its link. Create the free profile (see the free list) and keep the money.",
  },
];
