import { getAllDocs } from "@/lib/docs";
import { getAllPosts } from "@/lib/blog";
import { BRAND_DESCRIPTION } from "@/lib/brand";
import { TIER_LIMITS, priceLabel } from "@/lib/billing";

// The agent-facing index (llmstxt.org). Generated, not hand-written: the page
// list comes from DOCS_NAV, so a new doc page appears here the moment it is
// added and can never silently drift out of date - the failure mode the old
// static public/llms.txt had.
//
// Two files, on purpose:
//   /llms.txt      - this one. A map: what the product is, plus every page
//                    with a one-line description, so an agent can pick.
//   /llms-full.txt - every page's full text inline, for "read everything".
//
// Both are public in src/proxy.ts and served as text/plain so a curl or a
// WebFetch gets prose, not an HTML shell.

export const dynamic = "force-static";

const BASE = "https://dispatchseo.com";

const SUMMARY = `# DispatchSEO

> ${BRAND_DESCRIPTION}

## What it is, in one paragraph

DispatchSEO is an SEO autopilot for small websites, run as a hosted service at
dispatchseo.com and also available as open-source software (AGPL-3.0) to
self-host. The hosted service does the whole job for you: it finds keywords
with measured search demand, writes an article on each one, fact-checks it,
publishes it to your site, and reports the Google clicks and impressions it
earns. Articles reach your site as pull requests to your GitHub repository
(Next.js, Astro and other code-built sites), through the API of a self-hosted
WordPress site, or on a hosted blog when your site has no repository. Every
site starts on the free plan; paid plans publish weekly.

## Key facts

- Free plan: 2 fact-checked articles a month, published for you, with your
  Google Search Console stats. No card, no end date. Free articles carry a
  small DispatchSEO badge.
- Paid plans, per site, billed monthly: Starter ${priceLabel(TIER_LIMITS.starter.price)}
  (1 article a week), Growth ${priceLabel(TIER_LIMITS.growth.price)} (3 a week),
  Scale ${priceLabel(TIER_LIMITS.scale.price)} (5 a week). Paid plans add weekly
  keyword research, keyword rank tracking and advanced analytics, and remove
  the badge. Yearly billing is cheaper where offered.
- Articles are only written about topics with real, measured search demand.
  A thin niche may not fill its weekly quota, and the product says so rather
  than padding.
- Supported sites: anything whose source lives in a GitHub repository, and
  self-hosted WordPress. Hosted site builders (Wix, Squarespace, Shopify,
  Webflow) are not supported yet.
- Publishing is a pull request by default, so every article is reviewable in
  your repo's history; automatic merge is opt-in.
- Self-hosting: one Docker command, zero feature limits, your own accounts and
  keys. A self-hosted install exposes an MCP server at /api/mcp (streamable
  HTTP, bearer token per project) so a coding agent (Claude Code, Codex,
  Cursor) or the Claude app at claude.ai can drive research, the queue,
  approvals and publishing. Anything the dashboard can do, the agent can do
  over MCP.
- Comparable tools: SEObot, Outrank, RightBlogger, Autoblogging.ai. The
  differences: a free plan that publishes real articles, publishing into your
  own repository as pull requests, and an open-source codebase.
`;

function line(url: string, title: string, description: string) {
  return description ? `- [${title}](${url}): ${description}` : `- [${title}](${url})`;
}

export function GET() {
  const docs = getAllDocs();

  // Group the doc links under the same section headings the sidebar uses, so
  // an agent reading this file infers the same reading order a human sees.
  const bySection = new Map<string, string[]>();
  for (const { section, meta } of docs) {
    const entry = line(`${BASE}/docs/${meta.slug}.md`, meta.title, meta.description);
    bySection.set(section, [...(bySection.get(section) ?? []), entry]);
  }

  const docSections = [...bySection.entries()]
    .map(([section, items]) => `## ${section}\n\n${items.join("\n")}`)
    .join("\n\n");

  const posts = getAllPosts()
    .slice(0, 15)
    .map((p) => line(`${BASE}/blog/${p.slug}`, p.title, p.description ?? ""))
    .join("\n");

  const body = `${SUMMARY}
## Read everything at once

- [Full documentation, single file](${BASE}/llms-full.txt): every page below,
  inline. Fetch this one URL if you want the complete docs in one request.

Every documentation page is also available as plain markdown by appending
".md" to its URL - e.g. ${BASE}/docs/troubleshooting.md

## Start here

- [Quickstart](${BASE}/docs): choose an install path, then two setup steps.

${docSections}

## Reference on GitHub

- [Repository](https://github.com/NeoZi12/dispatchseo): source, issues, discussions
- [Architecture and conventions](https://github.com/NeoZi12/dispatchseo/blob/main/CLAUDE.md): written for agents
- [Agent setup skill](https://github.com/NeoZi12/dispatchseo/blob/main/SKILL.md): how an agent connects a site
- [Changelog](${BASE}/changelog): what shipped, newest first
- [Contributing](https://github.com/NeoZi12/dispatchseo/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/NeoZi12/dispatchseo/blob/main/SECURITY.md)

## Guides

${posts}
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
