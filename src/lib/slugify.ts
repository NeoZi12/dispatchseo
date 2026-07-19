// Shared heading slugifier - the single source of anchor ids for blog posts.
// Two consumers must stay in lockstep:
//   - src/components/blog/registry.tsx derives each rendered <h2 id> from it
//   - src/lib/blog.ts (getPostHeadings) derives the "On this page" ToC hrefs
// Hand-rolled on purpose: no npm dep, no rehype plugin.
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
