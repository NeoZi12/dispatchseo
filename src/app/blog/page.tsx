import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/app/site-nav";
import { PostCard } from "@/components/blog/PostCard";
import { getAllPosts } from "@/lib/blog";
import { coversForPosts } from "@/lib/blog-covers";

// Public blog index - the site's content home. Deliberately outside the
// (dashboard) group: no auth, no DB, builds from the filesystem alone.
//
// Layout: newest post as a full-width featured hero, everything older in a
// 2-col grid of image-topped cards below it (1-col on mobile) - image-led,
// Postiz-blog inspired. Reads right with 1 post (today) and with 40
// (later): there's always exactly one "latest" and the grid grows
// underneath it without the page needing a different shape. Container is
// max-w-4xl (wider than the rest of the site's max-w-2xl prose pages) so a
// 2-up grid of real cover images has room to breathe.

export const metadata: Metadata = {
  title: "Blog - DispatchSEO",
  description:
    "Guides on SEO on autopilot: what Google and the AI engines pick up, how articles get researched, fact-checked and published for you, and what it costs.",
  alternates: { canonical: "/blog" },
};

export default function BlogIndex() {
  const posts = getAllPosts();
  const [featured, ...rest] = posts;
  // Computed once over the full displayed order (featured first, then the
  // list below) so accents can be de-duped against neighbors - see
  // coversForPosts in lib/blog-covers.ts.
  const covers = coversForPosts(posts);

  return (
    <>
      <SiteNav />
    <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
      <header className="mb-12">
        {/* The nav above carries the logo; this is the explicit way back for
            a reader who arrived from a search result and only wants out. */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <span aria-hidden="true">←</span>
          Home
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
        <p className="mt-2 max-w-lg text-neutral-400">
          Guides on agent-driven SEO - written and shipped by the pipeline this product runs.
        </p>
      </header>

      {featured && (
        <PostCard post={featured} spec={covers.get(featured.slug)!} variant="featured" />
      )}

      {rest.length > 0 && (
        <div className="mt-10">
          <p className="mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            More posts
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {rest.map((post) => (
              <PostCard key={post.slug} post={post} spec={covers.get(post.slug)!} />
            ))}
          </div>
        </div>
      )}
    </main>
    </>
  );
}
