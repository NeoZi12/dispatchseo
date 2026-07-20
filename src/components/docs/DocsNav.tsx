"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar nav for /docs, in two shapes the layout mounts:
//   - "sidebar": the sticky left rail on lg+ screens
//   - "mobile":  a collapsed <details> panel above the content below lg
// Both read the same DOCS_NAV shape and share active-item logic - a page is
// active when its href matches the current pathname exactly (not prefix
// match, so /docs doesn't light up for every /docs/* page).

type Nav = { section: string; items: { slug: string; title: string }[] }[];

function hrefFor(slug: string) {
  return slug ? `/docs/${slug}` : "/docs";
}

function NavList({ nav, pathname, onNavigate }: { nav: Nav; pathname: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-6">
      {nav.map((section) => (
        <div key={section.section}>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            {section.section}
          </p>
          <ul className="mt-2.5 space-y-0.5">
            {section.items.map((item) => {
              const href = hrefFor(item.slug);
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`-ml-px block rounded-md border-l-2 py-1.5 pl-3 pr-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
                      active
                        ? "border-violet-400 font-medium text-neutral-100"
                        : "border-transparent text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DocsSidebar({ nav }: { nav: Nav }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs">
      <NavList nav={nav} pathname={pathname} />
    </nav>
  );
}

// Mobile: a closed-by-default panel, same jump-menu contract as the blog's
// inline "On this page" - not a live tracker, just fast access to every page
// without giving up a quarter of a narrow screen to a permanent sidebar.
export function DocsMobileNav({ nav, className = "" }: { nav: Nav; className?: string }) {
  const pathname = usePathname();
  const current = nav.flatMap((s) => s.items).find((item) => hrefFor(item.slug) === pathname);

  return (
    <details className={`group rounded-xl bg-neutral-900 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium text-neutral-200 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950">
        <span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500">Docs</span>
          {current && <span className="ml-2 text-neutral-100">{current.title}</span>}
        </span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="size-3.5 shrink-0 text-neutral-500 transition-transform duration-200 group-open:rotate-180"
        >
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <nav aria-label="Docs" className="border-t border-neutral-800 px-4 py-4">
        <NavList nav={nav} pathname={pathname} />
      </nav>
    </details>
  );
}
