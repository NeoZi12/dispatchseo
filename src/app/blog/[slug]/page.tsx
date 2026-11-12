import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import { getAllPosts, getPost, getPostHeadings } from "@/lib/blog";
import { compareMdxComponents, mdxComponents } from "@/components/blog/registry";
import { TableOfContents } from "@/components/blog/TableOfContents";
import { SideAd } from "@/components/blog/SideAd";
import { SiteNav } from "@/app/site-nav";
import { rehypeCompareTables } from "@/lib/rehype-compare-tables";
import { BRAND_URL } from "@/lib/brand";

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
    // Googlebot only (see PostMeta.googleNoindex): every other crawler keeps
    // indexing the page, which is who it was written for.
    ...(post.meta.googleNoindex ? { robots: { googleBot: { index: false, follow: true } } } : {}),
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

  // Article structured data: who published this and when, stated once in the
  // shape Google reads. Organization, not Person, until the site has a real
  // named author with a page of their own - an invented byline is worse than
  // none. URLs are absolute on dispatchseo.com, same as metadataBase.
  const origin = "https://dispatchseo.com";
  const url = `${origin}/blog/${slug}`;
  const modified = post.meta.updated ?? post.meta.date;
  const compare = post.meta.compareKind;
  const products = post.meta.compareProducts ?? [];
  // A compared product as structured data. Ours points at the one
  // SoftwareApplication node the landing page defines (brand.ts), so every
  // page agrees on what DispatchSEO is; the others are named and linked only.
  // No ratings for anyone: we never mark up a score we gave a competitor.
  const productLd = (p: { name: string; url: string }) =>
    /^dispatchseo$/i.test(p.name)
      ? { "@type": "SoftwareApplication", "@id": `${BRAND_URL}/#software`, name: p.name, url: BRAND_URL }
      : { "@type": "SoftwareApplication", name: p.name, url: p.url };
  // The Article every post carries. Key order is the order it prints in, and
  // a plain post's markup must stay exactly what it was - see below.
  const article = {
    "@type": "Article",
    headline: post.meta.title,
    description: post.meta.description,
    datePublished: post.meta.date,
    dateModified: modified,
    mainEntityOfPage: url,
    ...(post.meta.cover ? { image: `${origin}${post.meta.cover}` } : {}),
    author: { "@type": "Organization", name: "DispatchSEO", url: origin },
    publisher: { "@type": "Organization", name: "DispatchSEO", url: origin },
  };
  // A comparison post (frontmatter `compareKind`) says more: which products it
  // is about, where it sits on the site, and - for "best X" / "X alternatives"
  // lists - the products in the order the page presents them. Every other post
  // prints the single Article it always has, unchanged: the comparison layout
  // must never move the rest of the blog (Google is re-reading those posts).
  const articleLd = compare
    ? {
        "@context": "https://schema.org",
        "@graph": [
          { ...article, ...(products.length ? { about: products.map(productLd) } : {}) },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "DispatchSEO", item: origin },
              { "@type": "ListItem", position: 2, name: "Blog", item: `${origin}/blog` },
              { "@type": "ListItem", position: 3, name: post.meta.title, item: url },
            ],
          },
          ...(compare === "list" && products.length
            ? [
                {
                  "@type": "ItemList",
                  name: post.meta.title,
                  itemListElement: products.map((p, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    item: productLd(p),
                  })),
                },
              ]
            : []),
        ],
      }
    : { "@context": "https://schema.org", ...article };

  return (
    // Below lg this is the same centered column as before; from lg up, with
    // a rail to show, the container widens into a two-column grid. The
    // article keeps first claim on width (minmax(0,1fr) so long code lines
    // can't blow the layout out) beside a fixed 240px rail. The grid must
    // NOT be items-start: the aside has to stretch to the article's full
    // height or its sticky child has no room to travel and never pins.
    <>
      <SiteNav />
    <main
      className={
        showRail
          ? "mx-auto max-w-3xl px-6 py-12 lg:max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_240px] lg:gap-16"
          : "mx-auto max-w-3xl px-6 py-12"
      }
    >
      <article className="max-w-3xl">
        <script
          type="application/ld+json"
          // JSON.stringify of our own frontmatter; "<" escaped so a title can
          // never close the script tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, "\\u003c") }}
        />
        {/* One clear back affordance, not a breadcrumb - the old
            "DispatchSEO / Blog" crumb read as two static labels, not
            something to click. This is a real link to the index, styled in
            the site's quiet-link grammar (see the home link on /blog). */}
        <Link
          href="/blog"
          className="mb-8 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          <span aria-hidden="true">←</span>
          All posts
        </Link>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{post.meta.title}</h1>
          <p className="mt-2 flex items-center gap-2 text-sm text-neutral-500">
            {post.meta.updated ? (
              <span>
                Updated <time dateTime={post.meta.updated}>{longDate(post.meta.updated)}</time>
              </span>
            ) : (
              <time dateTime={post.meta.date}>{longDate(post.meta.date)}</time>
            )}
            <span aria-hidden="true">·</span>
            <span>{post.meta.readingMinutes} min read</span>
          </p>
        </header>
        {/* Comparison pages skip the hero image: the short answer is what
            people and AI engines came for, so it goes first. */}
        {post.meta.cover && !compare && (
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
        <MDXRemote
          source={post.content}
          components={compare ? compareMdxComponents : mdxComponents}
          options={{
            mdxOptions: compare
              ? { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeCompareTables] }
              : { remarkPlugins: [remarkGfm] },
          }}
        />
        <div className="mt-12 border-t border-neutral-800 pt-6">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            <span aria-hidden="true">←</span>
            All posts
          </Link>
        </div>
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
    </>
  );
}
