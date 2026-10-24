"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Hosted mode's one-line "finish setup" bar under the topbar. Hidden on the
// report itself, which already shows the full checklist - the same gap said
// twice on one screen is noise.
export function HostedSetupBar({ title, href, remaining }: { title: string; href: string | null; remaining: number }) {
  const pathname = usePathname();
  if (pathname === "/dashboard") return null;
  return (
    <div className="border-b border-line-soft bg-surface">
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[13px] sm:px-6 lg:px-8">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
        <span className="text-ink-muted">
          Finish setup: <span className="text-ink">{title}</span>
          {remaining > 1 ? <span className="text-ink-faint"> and {remaining - 1} more</span> : null}
        </span>
        <Link
          href={href ?? "/dashboard"}
          className="ml-auto font-medium text-accent underline decoration-accent/40 underline-offset-[3px] hover:decoration-accent"
        >
          {href ? "Do it now" : "See setup"}
        </Link>
      </div>
    </div>
  );
}
