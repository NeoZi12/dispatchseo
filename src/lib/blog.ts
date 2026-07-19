import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { slugify } from "@/lib/slugify";

// The blog content home: src/content/blog/*.mdx, one file per post, slug =
// filename. Filesystem-only (no DB) so /blog stays public and builds with
// zero env. Frontmatter contract (enforced socially, not by types): title
// and description required; date (YYYY-MM-DD) required; keyword optional
// (the primary keyword the post targets - the SEO pipeline sets it).

export type PostMeta = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingMinutes: number;
  keyword?: string;
  cover?: string; // absolute-from-root image path (e.g. /blog/covers/<slug>.webp)
};

const BLOG_DIR = join(process.cwd(), "src/content/blog");

const WORDS_PER_MINUTE = 200;

// Rough reading-time estimate from the raw MDX body's word count - code
// fences and JSX component tags count as "words" too, which is fine for a
// meta line (industry-standard ~200wpm assumption, rounded up to 1 min min).
export function estimateReadingMinutes(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

export function getAllPosts(): PostMeta[] {
  let files: string[] = [];
  try {
    files = readdirSync(BLOG_DIR).filter((f) => f.endsWith(".mdx"));
  } catch {
    return []; // no content dir yet - the list page renders its empty state
  }
  return files
    .map((file) => {
      const { data, content } = matter(readFileSync(join(BLOG_DIR, file), "utf8"));
      return {
        slug: file.replace(/\.mdx$/, ""),
        title: (data.title as string) ?? file,
        description: (data.description as string) ?? "",
        date: (data.date as string) ?? "1970-01-01",
        readingMinutes: estimateReadingMinutes(content),
        ...(data.keyword ? { keyword: data.keyword as string } : {}),
        ...(data.cover ? { cover: data.cover as string } : {}),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): { meta: PostMeta; content: string } | null {
  // Slug comes from the URL - keep it a bare filename so a crafted path
  // can never escape the content dir.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    const raw = readFileSync(join(BLOG_DIR, `${slug}.mdx`), "utf8");
    const { data, content } = matter(raw);
    return {
      meta: {
        slug,
        title: (data.title as string) ?? slug,
        description: (data.description as string) ?? "",
        date: (data.date as string) ?? "1970-01-01",
        readingMinutes: estimateReadingMinutes(content),
        ...(data.keyword ? { keyword: data.keyword as string } : {}),
      },
      content,
    };
  } catch {
    return null;
  }
}

export type PostHeading = { id: string; text: string };

// Strips inline markdown (links, code ticks, emphasis, quotes) from a raw
// `## ` heading line so the ToC shows clean text. Ids MUST match the <h2 id>
// that registry.tsx renders - both sides slugify the same visible text.
function cleanHeadingText(raw: string): string {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/[`*_~]/g, "") // inline code / bold / italic / strikethrough
    .replace(/["“”]/g, "") // straight + curly double quotes
    .trim();
}

// H2 headings ({ id, text }) for a post's "On this page" ToC, extracted from
// the raw markdown so section names are never hardcoded. Fenced code blocks
// are skipped (a `## comment` inside a snippet is not a section).
export function getPostHeadings(slug: string): PostHeading[] {
  const post = getPost(slug);
  if (!post) return [];

  const headings: PostHeading[] = [];
  let inFence = false;
  for (const line of post.content.split("\n")) {
    if (/^(```|~~~)/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    // Exactly two #s (### is an h3), with optional ATX-style closing hashes.
    const match = /^##\s+(.*?)\s*#*\s*$/.exec(line);
    if (!match) continue;
    const text = cleanHeadingText(match[1]);
    if (!text) continue;
    headings.push({ id: slugify(text), text });
  }
  return headings;
}
