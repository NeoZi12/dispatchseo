import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { slugify } from "@/lib/slugify";

// The docs content home: src/content/docs/*.mdx, one file per page, slug =
// filename. Same filesystem-only contract as the blog (src/lib/blog.ts):
// no DB, no auth, builds with zero env, so /docs stays public on the cloud
// deployment and harmless on self-hosted ones.

export type DocMeta = {
  slug: string;
  title: string;
  description: string;
};

export type DocHeading = { id: string; text: string };

// Sidebar order is editorial, not alphabetical - defined here, not in
// frontmatter, so reordering is one edit. The quickstart lives at /docs
// itself (a custom page, not MDX), so it appears here with slug "".
// A nav item is normally an MDX page (slug -> src/content/docs/<slug>.mdx).
// An item carrying `href` instead is a link out of the docs tree - it has no
// MDX file, so it is skipped by getDocSlugs/getAllDocs and by the prev/next
// footer, and the sidebar renders it with an outbound arrow.
// `external` marks an href that leaves the app (or, like /discord, redirects
// off it): the sidebar renders those as a plain anchor in a new tab, because a
// client-side Link into a redirect has nothing to render on the way out.
export type DocsNavItem = { slug: string; title: string; href?: string; external?: boolean };

export const DOCS_NAV: { section: string; items: DocsNavItem[] }[] = [
  {
    section: "Getting started",
    // "What it is" leads because the docs are the landing page for repo
    // traffic - someone arriving from GitHub needs the product explained
    // before being asked to choose an install path. The quickstart keeps the
    // bare /docs URL (deep-linked from the README button and start.sh).
    items: [
      { slug: "introduction", title: "What DispatchSEO is" },
      { slug: "", title: "Quickstart" },
      { slug: "how-it-works", title: "How it works" },
      { slug: "choosing-how-to-run-it", title: "Cloud or self-hosted" },
    ],
  },
  {
    section: "Installation",
    items: [
      { slug: "docker-compose", title: "Your own computer" },
      { slug: "vps", title: "A VPS or server" },
      { slug: "coolify", title: "A Coolify server" },
      { slug: "local-development", title: "From source (contributors)" },
    ],
  },
  {
    section: "Setup",
    items: [
      // First in the section on purpose: it is the one prerequisite the
      // wizard cannot check for you, and the step every other Setup page
      // assumes is already done. Both onboarding wizards deep-link here
      // from their Claude Code screens.
      { slug: "install-claude-code", title: "Install Claude Code" },
      // Immediately after it: the second agent is a choice people make at the
      // same moment, and burying it further down reads as "unsupported".
      { slug: "install-codex", title: "Use Codex instead" },
      // Third agent, same reasoning: someone who already lives in Cursor looks
      // for it here, and its absence from this list reads as "unsupported".
      { slug: "install-cursor", title: "Use Cursor" },
      { slug: "setup-wizard", title: "The setup wizard" },
      { slug: "search-console", title: "Google Search Console" },
      { slug: "keyword-data", title: "Keyword data sources" },
      { slug: "publishing", title: "Publishing and GitHub" },
      { slug: "connect-your-site", title: "Connect your site" },
    ],
  },
  {
    section: "Using it",
    items: [
      { slug: "day-to-day", title: "Day to day" },
      { slug: "dashboard", title: "The dashboard, page by page" },
      { slug: "automations", title: "Automations and modes" },
      { slug: "agent-commands", title: "Agent commands" },
    ],
  },
  {
    section: "Reference",
    items: [
      { slug: "concepts", title: "Concepts and glossary" },
      { slug: "mcp-tools", title: "MCP tools" },
      { slug: "environment-variables", title: "Environment variables" },
      { slug: "schedules", title: "Schedules and jobs" },
      { slug: "architecture", title: "Architecture" },
      // Lives outside /docs (it reads from src/lib/changelog.ts and is linked
      // from the dashboard's update banner), but it belongs in this list -
      // "what changed in the last release" is a reference question.
      { slug: "", title: "Changelog", href: "/changelog" },
    ],
  },
  {
    section: "Help",
    items: [
      // First in Help, above the pages: someone opening this section is
      // already stuck, and the fastest answer is a person. /discord is our own
      // redirect (next.config.ts), so the invite code stays in one place and a
      // self-hosted install resolves it against its own origin.
      { slug: "", title: "Ask on Discord", href: "/discord", external: true },
      { slug: "troubleshooting", title: "Troubleshooting" },
      { slug: "faq", title: "Common questions" },
      { slug: "security", title: "Security and your data" },
      { slug: "upgrading", title: "Upgrading and backups" },
    ],
  },
];

const DOCS_DIR = join(process.cwd(), "src/content/docs");

export function getDocSlugs(): string[] {
  return DOCS_NAV.flatMap((s) => s.items)
    .filter((i) => !i.href)
    .map((i) => i.slug)
    .filter(Boolean);
}

// Every MDX page in sidebar order, content included. Feeds the agent-facing
// mirrors (/llms.txt, /llms-full.txt, /docs/<slug>.md) so an agent that
// fetches one URL gets the same docs a human reads, in the same order. Pages
// whose file is missing are skipped rather than throwing - a nav entry can
// legitimately point at the custom quickstart page, which has no MDX file.
export function getAllDocs(): { section: string; meta: DocMeta; content: string }[] {
  const out: { section: string; meta: DocMeta; content: string }[] = [];
  for (const section of DOCS_NAV) {
    for (const item of section.items) {
      if (!item.slug || item.href) continue;
      const doc = getDoc(item.slug);
      if (doc) out.push({ section: section.section, meta: doc.meta, content: doc.content });
    }
  }
  return out;
}

export function getDoc(slug: string): { meta: DocMeta; content: string } | null {
  // Slug comes from the URL - keep it a bare filename so a crafted path
  // can never escape the content dir.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = readFileSync(join(DOCS_DIR, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    return {
      meta: {
        slug,
        title: (data.title as string) ?? slug,
        description: (data.description as string) ?? "",
      },
      content,
    };
  } catch {
    return null;
  }
}

// H2 extraction for the "On this page" rail - same contract as
// getPostHeadings in blog.ts: ids must match what the MDX registry's h2
// renderer produces. A numbered install step (src/components/blog/steps.tsx)
// renders its own h2 from a `title` prop instead of a literal "## " line, so
// a <Step ... title="..."> tag counts as a heading too - same id, read
// straight out of the raw MDX rather than the compiled JSX.
export function getDocHeadings(slug: string): DocHeading[] {
  const doc = getDoc(slug);
  if (!doc) return [];
  const headings: DocHeading[] = [];
  let inFence = false;
  for (const line of doc.content.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h2Match = /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (h2Match) {
      const text = h2Match[1].replace(/`/g, "").trim();
      if (text) headings.push({ id: slugify(text), text });
      continue;
    }

    const stepMatch = /<Step\b[^>]*\btitle=["']([^"']+)["']/.exec(line);
    if (stepMatch) {
      const text = stepMatch[1].trim();
      if (text) headings.push({ id: slugify(text), text });
    }
  }
  return headings;
}
