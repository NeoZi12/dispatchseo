"use client";

import { useEffect, useState } from "react";
import type { PostHeading } from "@/lib/blog";

// "On this page" ToC for blog posts, in two shapes the [slug] page mounts:
//   - "rail":   the right-hand reading rail on lg+ screens (sticky, alongside
//     the SideAd)
//   - "inline": a collapsed <details> panel above the article body below lg
// Links are plain anchors - keyboard and no-JS still work.

// Scroll-spy: the active item is whichever heading is currently crossing a
// thin band near the top of the viewport. A trailing scroll check covers the
// page-bottom case, where a short last section never reaches that band.
function useActiveHeading(headings: PostHeading[]): string | null {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);

  useEffect(() => {
    const els = headings
      .map((h) => document.getElementById(h.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
            break;
          }
        }
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));

    const onScroll = () => {
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) setActive(els[els.length - 1].id);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [headings]);

  return active;
}

function TocLink({ heading, active }: { heading: PostHeading; active: boolean }) {
  return (
    <a
      href={`#${heading.id}`}
      aria-current={active ? "true" : undefined}
      className={`-ml-px block border-l-2 py-1.5 pl-3 pr-2 text-[13px] leading-snug outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 ${
        active
          ? "border-violet-400 font-medium text-neutral-100"
          : "border-transparent text-neutral-500 hover:border-neutral-700 hover:text-neutral-300"
      }`}
    >
      {heading.text}
    </a>
  );
}

export function TableOfContents({
  headings,
  variant,
  className = "",
}: {
  headings: PostHeading[];
  variant: "rail" | "inline";
  className?: string;
}) {
  const active = useActiveHeading(headings);

  if (variant === "rail") {
    return (
      <nav aria-label="On this page" className={className}>
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
          On this page
        </p>
        <ul className="mt-3 space-y-0.5 border-l border-neutral-800">
          {headings.map((h) => (
            <li key={h.id}>
              <TocLink heading={h} active={active === h.id} />
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  // Inline (below lg): a collapsed panel in the article flow, closed by
  // default - a jump menu, not a live tracker, so no active-state wiring.
  return (
    <details className={`group rounded-xl bg-neutral-900 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-300 outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-violet-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950">
        On this page
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          fill="none"
          className="size-3.5 shrink-0 text-neutral-500 transition-transform duration-200 group-open:rotate-180"
        >
          <path
            d="M4 6l4 4 4-4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <nav aria-label="On this page" className="border-t border-neutral-800 px-4 py-3">
        <ul className="space-y-1">
          {headings.map((h) => (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                className="block rounded-md px-2 py-1 text-[13px] text-neutral-400 outline-none transition-colors hover:text-neutral-200 focus-visible:ring-2 focus-visible:ring-violet-400/60"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </details>
  );
}
