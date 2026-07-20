import Link from "next/link";
import { DispatchMark } from "@/components/logo";
import { DOCS_NAV } from "@/lib/docs";
import { DocsSidebar, DocsMobileNav } from "@/components/docs/DocsNav";

// Public docs shell - a sibling of /blog, not a different product: same
// neutral-950 surface, violet-400 accents, quiet-link and mono-label
// grammar. No auth, no DB - static at build time.
//
// Shape: sticky header, then a [sidebar | content] grid from lg up. The
// content column is `minmax(0,1fr)` so a doc page can further split itself
// into [article | on-this-page rail] at xl without ever fighting this outer
// grid for space (see src/app/docs/[slug]/page.tsx).

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="sticky top-0 z-20 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-md text-sm font-medium text-neutral-200 outline-none transition-colors hover:text-neutral-50 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            <DispatchMark className="h-5 w-5" />
            DispatchSEO
            <span className="text-neutral-600" aria-hidden="true">
              /
            </span>
            <span className="text-neutral-400">Docs</span>
          </Link>
          <a
            href="https://github.com/NeoZi12/dispatchseo"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            <GithubIcon />
            GitHub
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-6 py-10 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto overscroll-contain pb-8">
            <DocsSidebar nav={DOCS_NAV} />
          </div>
        </aside>

        <div className="min-w-0">
          <DocsMobileNav nav={DOCS_NAV} className="mb-8 lg:hidden" />
          {children}
        </div>
      </div>
    </div>
  );
}
