import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { DOCS_NAV, getDoc, getDocSlugs, getDocHeadings } from "@/lib/docs";
import { mdxComponents } from "@/components/blog/registry";
import { TableOfContents } from "@/components/blog/TableOfContents";

// Public doc page. Static at build time (generateStaticParams) - no auth,
// no DB, renders MDX from src/content/docs with the blog's registry (same
// dark typographic defaults, so a doc page and a blog post never look like
// two different products).

export function generateStaticParams() {
  return getDocSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: `${doc.meta.title} - DispatchSEO Docs`,
    description: doc.meta.description,
    alternates: { canonical: `/docs/${slug}` },
  };
}

// Flattened page order (quickstart, then every DOCS_NAV item in editorial
// order) - the single source for prev/next footer links, so reordering
// DOCS_NAV automatically reorders the footer with it.
const FLAT_PAGES = DOCS_NAV.flatMap((s) => s.items);

function hrefFor(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  // "On this page" rail only once there's enough headings to be worth a
  // rail - short pages (e.g. troubleshooting's few sections) keep the plain
  // column. Rail breaks in at xl, not lg: the outer docs layout already
  // spends lg's width on the left sidebar, so a second split at the same
  // breakpoint would squeeze the article too narrow right at the seam.
  const headings = getDocHeadings(slug);
  const showRail = headings.length >= 3;

  const currentIndex = FLAT_PAGES.findIndex((item) => item.slug === slug);
  const prev = currentIndex > 0 ? FLAT_PAGES[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < FLAT_PAGES.length - 1 ? FLAT_PAGES[currentIndex + 1] : null;

  return (
    <div className={showRail ? "xl:grid xl:grid-cols-[minmax(0,1fr)_240px] xl:gap-12" : ""}>
      <article className="min-w-0 max-w-3xl">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight">{doc.meta.title}</h1>
          {doc.meta.description && (
            <p className="mt-2 text-lg text-neutral-400">{doc.meta.description}</p>
          )}
        </header>

        {showRail && (
          <TableOfContents headings={headings} variant="inline" className="mb-8 xl:hidden" />
        )}

        <MDXRemote source={doc.content} components={mdxComponents} />

        {(prev || next) && (
          <div className="mt-12 grid grid-cols-1 gap-3 border-t border-neutral-800 pt-6 sm:grid-cols-2">
            {prev ? (
              <Link
                href={hrefFor(prev.slug)}
                className="group rounded-lg border border-neutral-800 px-4 py-3 outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  ← Previous
                </span>
                <span className="mt-1 block text-sm font-medium text-neutral-200 group-hover:text-neutral-50">
                  {prev.title}
                </span>
              </Link>
            ) : (
              <div />
            )}
            {next && (
              <Link
                href={hrefFor(next.slug)}
                className="group rounded-lg border border-neutral-800 px-4 py-3 text-right outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
              >
                <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">
                  Next →
                </span>
                <span className="mt-1 block text-sm font-medium text-neutral-200 group-hover:text-neutral-50">
                  {next.title}
                </span>
              </Link>
            )}
          </div>
        )}
      </article>

      {showRail && (
        <aside className="hidden xl:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain">
            <TableOfContents headings={headings} variant="rail" />
          </div>
        </aside>
      )}
    </div>
  );
}
