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
export const DOCS_NAV: { section: string; items: { slug: string; title: string }[] }[] = [
  {
    section: "Getting started",
    items: [{ slug: "", title: "Quickstart" }],
  },
  {
    section: "Installation",
    items: [
      { slug: "docker-compose", title: "Your own computer" },
      { slug: "vps", title: "A VPS or server" },
      { slug: "local-development", title: "From source (contributors)" },
    ],
  },
  {
    section: "Setup",
    items: [
      { slug: "setup-wizard", title: "The setup wizard" },
      { slug: "search-console", title: "Google Search Console" },
      { slug: "connect-your-site", title: "Connect your site" },
    ],
  },
  {
    section: "Using it",
    items: [
      { slug: "day-to-day", title: "Day to day" },
      { slug: "troubleshooting", title: "Troubleshooting" },
    ],
  },
];

const DOCS_DIR = join(process.cwd(), "src/content/docs");

export function getDocSlugs(): string[] {
  return DOCS_NAV.flatMap((s) => s.items.map((i) => i.slug)).filter(Boolean);
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
