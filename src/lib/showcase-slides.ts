// The product screenshot reel, shared by the landing FeatureShowcase and the
// auth pages' AuthShowcase (DataFast/Postiz-style signup: form left, product
// proof right). One list so a new screenshot shows up everywhere.

export type Slide = {
  id: string;
  title: string;
  caption: string;
  image: string;
  alt: string;
};

export const SLIDES: Slide[] = [
  {
    id: "traffic",
    title: "Watch your traffic grow",
    caption: "Clicks and impressions, straight from Google.",
    image: "/screenshots/search-traffic.png",
    alt: "Search traffic chart showing clicks and impressions from Google over 30 days",
  },
  {
    id: "guides",
    title: "Daily guides, on autopilot",
    caption: "Written, shipped, and indexed - one a day.",
    image: "/screenshots/guides.png",
    alt: "A published guide article, 'Claude Code in GitHub Actions', with an on-this-page table of contents, written and shipped by the pipeline",
  },
  {
    id: "tools",
    title: "Interactive tools that earn links",
    caption: "Calculators and generators, built and shipped for you.",
    image: "/screenshots/tools.jpeg",
    alt: "A published interactive tool, the CLAUDE.md Generator, a seven-question quiz that outputs a tuned CLAUDE.md file",
  },
  {
    id: "automations",
    title: "Every automation has an off switch",
    caption: "Auto, semi, or manual - you set the gates.",
    image: "/screenshots/automations.png",
    alt: "Automations page with per-feature toggles for auto-approval and daily builds",
  },
  {
    id: "instructions",
    title: "You write the rules",
    caption: "The playbook your agent follows, editable live.",
    image: "/screenshots/instructions.png",
    alt: "Instructions page showing the site's theme, voice, and what the agent builds",
  },
  {
    id: "rankings",
    title: "Watch ranks move",
    caption: "Daily SERP checks on every keyword.",
    image: "/screenshots/rankings-v2.png",
    alt: "Rank tracking table showing keyword positions over time",
  },
  {
    id: "trends",
    title: "Catch trends early",
    caption: "Rising topics in your niche become guides.",
    image: "/screenshots/trends.png",
    alt: "Trends page showing trending subjects on the radar with ideas ready to queue",
  },
  {
    id: "ai-visibility",
    title: "Track AI visibility",
    caption: "Know when AI assistants cite you.",
    image: "/screenshots/ai-visibility.png",
    alt: "AI visibility page tracking how often AI assistants cite the site",
  },
  {
    id: "backlinks",
    title: "A backlink playbook, researched",
    caption: "Every link worth getting, with exact steps.",
    image: "/screenshots/backlinks.png",
    alt: "Backlink playbook listing free and paid link opportunities with submission steps",
  },
];
