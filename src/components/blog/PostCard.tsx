import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import type { CoverSpec } from "@/lib/blog-covers";
import { CoverArt } from "./CoverArt";

// One post in the blog index, in two weights sharing a link/hover grammar
// (mirrors the "rail"/"inline" variant split in TableOfContents.tsx):
//   - "featured": the newest post, a wide cover plate, full description
//   - "default":  everything older, a compact row with a small cover thumb
// Whole card is one Link so the click target is unambiguous. The card SHELL
// still matches the dashboard's own grammar (BigStatTile in ui.tsx) -
// neutral-900 rectangle, no gradients on the card itself - but each card now
// carries a generated cover plate (see CoverArt.tsx) so the index reads as
// more than stacked text. The plate is decorative (aria-hidden); it never
// substitutes for real content.
//
// `spec` (accent + motif) is computed by the caller via
// `coversForPosts(allPosts)`, not looked up here per-card - accent de-dupe
// needs to see the whole list in display order to keep neighboring cards
// from landing on the same color block.

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function PostCard({
  post,
  spec,
  variant = "default",
}: {
  post: PostMeta;
  spec: CoverSpec;
  variant?: "featured" | "default";
}) {
  if (variant === "featured") {
    return (
      <Link
        href={`/blog/${post.slug}`}
        className="group block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 outline-none transition-colors hover:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
      >
        <CoverArt
          accent={spec.accent}
          motif={spec.motif}
          className="aspect-[16/9] w-full sm:aspect-[16/7]"
        />
        <div className="p-6 sm:p-8">
          <p className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-violet-400">
            Latest
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral-100 transition-colors group-hover:text-violet-300 sm:text-3xl">
            {post.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-neutral-400">{post.description}</p>
          <div className="mt-4 flex items-center gap-2 text-xs text-neutral-500">
            <time dateTime={post.date}>{shortDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingMinutes} min read</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4 outline-none transition-colors hover:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 sm:p-5"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg sm:h-24 sm:w-24">
        <CoverArt accent={spec.accent} motif={spec.motif} className="h-full w-full" />
      </div>
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-100 transition-colors group-hover:text-violet-300">
          {post.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">
          {post.description}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
          <time dateTime={post.date}>{shortDate(post.date)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} min read</span>
        </div>
      </div>
    </Link>
  );
}
