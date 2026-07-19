import Image from "next/image";
import Link from "next/link";
import type { PostMeta } from "@/lib/blog";
import type { CoverSpec } from "@/lib/blog-covers";
import { CoverArt } from "./CoverArt";

// One post in the blog index, in two weights sharing a link/hover grammar
// (mirrors the "rail"/"inline" variant split in TableOfContents.tsx):
//   - "featured": the newest post, a full-width 16:9 hero cover
//   - "default":  everything older, an image-topped card in a 2-col grid
// Image-led, Postiz-blog inspired: both variants are one Link with the cover
// filling the top and the text stacked below it - no more inline thumbnail
// row. Whole card is one Link so the click target is unambiguous. The shell
// still matches the dashboard's own grammar (BigStatTile in ui.tsx) -
// neutral-900 rectangle, no gradients on the card itself.
//
// Cover art has two sources sharing one slot: a real generated photo
// (`post.cover`, committed separately under public/blog/covers/) when one
// exists, else the procedural CoverArt plate (see CoverArt.tsx) as a
// graceful fallback so the index never shows a broken image while covers are
// still being generated post-by-post. Either way the cover is decorative
// (empty alt / aria-hidden) - the card's text carries all the meaning.
//
// `spec` (accent + motif, used only by the CoverArt fallback) is computed by
// the caller via `coversForPosts(allPosts)`, not looked up here per-card -
// accent de-dupe needs to see the whole list in display order to keep
// neighboring cards from landing on the same color block.

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Cover({
  post,
  spec,
  className,
  sizes,
  priority,
}: {
  post: PostMeta;
  spec: CoverSpec;
  className: string;
  sizes: string;
  priority?: boolean;
}) {
  if (post.cover) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={post.cover}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }
  return <CoverArt accent={spec.accent} motif={spec.motif} className={className} />;
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
        <Cover
          post={post}
          spec={spec}
          className="aspect-[16/9] w-full sm:aspect-[16/7]"
          sizes="(min-width: 1024px) 896px, 100vw"
          priority
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
      className="group flex flex-col overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 outline-none transition-colors hover:border-violet-500/40 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
    >
      <Cover
        post={post}
        spec={spec}
        className="aspect-[16/9] w-full"
        sizes="(min-width: 1024px) 420px, (min-width: 640px) 50vw, 100vw"
      />
      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-semibold tracking-tight text-neutral-100 transition-colors group-hover:text-violet-300">
          {post.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-neutral-400">
          {post.description}
        </p>
        <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-neutral-500">
          <time dateTime={post.date}>{shortDate(post.date)}</time>
          <span aria-hidden="true">·</span>
          <span>{post.readingMinutes} min read</span>
        </div>
      </div>
    </Link>
  );
}
