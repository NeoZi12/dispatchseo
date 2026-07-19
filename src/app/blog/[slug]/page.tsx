import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPost, getPostHeadings } from "@/lib/blog";
import { mdxComponents } from "@/components/blog/registry";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { SideAd } from "@/components/blog/SideAd";

// Public post page. Static at build time (generateStaticParams) - no auth,
// no DB, renders MDX from src/content/blog with the registry's components.

export function generateStaticParams() {
  return getAllPosts().map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};
  return {
    title: `${post.meta.title} - DispatchSEO`,
    description: post.meta.description,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      title: post.meta.title,
      description: post.meta.description,
      type: "article",
    },
  };
}

function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) notFound();

  // "On this page" ToC: H2 sections extracted from the raw markdown, ids
  // matching the <h2 id>s the registry renders. Short posts (fewer than 3
  // sections) skip the rail entirely and keep the plain centered column -
  // the SideAd still gets a spot inline so a short post is never CTA-less.
  const headings = getPostHeadings(slug);
  const showRail = headings.length >= 3;

  return (
    // Below lg this is the same centered column as before; from lg up, with
    // a rail to show, the container widens into a two-column grid. The
    // article keeps first claim on width (minmax(0,1fr) so long code lines
    // can't blow the layout out) beside a fixed 240px rail. The grid must
    // NOT be items-start: the aside has to stretch to the article's full
    // height or its sticky child has no room to travel and never pins.
    <main
      className={
        showRail
          ? "mx-auto max-w-3xl px-6 py-16 lg:max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16"
          : "mx-auto max-w-3xl px-6 py-16"
      }
    >
      <article className="max-w-3xl">
        <nav className="mb-8 flex items-center gap-1.5 text-sm text-neutral-500">
          <Link
            href="/"
            className="rounded-md outline-none transition-colors hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            DispatchSEO
          </Link>
          <span aria-hidden="true" className="text-neutral-700">
            /
          </span>
          <Link
            href="/blog"
            className="rounded-md outline-none transition-colors hover:text-neutral-300 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Blog
          </Link>
        </nav>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{post.meta.title}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
            <time dateTime={post.meta.date}>{longDate(post.meta.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.meta.readingMinutes} min read</span>
          </p>
        </header>
        {post.meta.cover && (
          <div className="relative mb-8 aspect-[16/9] w-full overflow-hidden rounded-xl">
            {/* Decorative hero - the title above already names the post, so
                the image needs no alt text. No CoverArt-plate fallback here:
                a post without a cover keeps the pre-image layout exactly,
                it doesn't get a generic plate in its place. */}
            <Image
              src={post.meta.cover}
              alt=""
              fill
              sizes="(min-width: 1024px) 768px, calc(100vw - 48px)"
              priority
              className="object-cover"
            />
          </div>
        )}
        {showRail ? (
          <TableOfContents headings={headings} variant="inline" className="mb-8 lg:hidden" />
        ) : (
          <SideAd className="mb-8" />
        )}
        <MDXRemote source={post.content} components={mdxComponents} />
      </article>
      {showRail && (
        <aside className="hidden lg:block">
          {/* One sticky column holding the ToC and the SideAd, so both stay
              in place while the article scrolls. Capped to the viewport;
              if a long ToC outgrows the cap it scrolls internally and the
              ad below stays visible. */}
          <div className="sticky top-12 flex max-h-[calc(100vh-6rem)] flex-col gap-8">
            <TableOfContents
              headings={headings}
              variant="rail"
              className="min-h-0 overflow-y-auto overscroll-contain"
            />
            <SideAd className="shrink-0" />
          </div>
        </aside>
      )}
    </main>
  );
}
