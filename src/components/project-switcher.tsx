"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { switchProject } from "@/app/actions";

// Vercel-style project picker in the header: the current project's domain with
// a chevron, a dropdown listing every project, and Add project at the bottom.
// Selecting writes the dash_project cookie (server action) and refreshes so
// every screen re-renders scoped to the new project.

export type SwitcherProject = { slug: string; name: string; domain: string };

// The project's real site favicon, Vercel-style. Google's favicon service
// resolves it for any domain with zero setup; when it can't (brand-new site,
// blocked request), fall back to a letter avatar so the row never shows a
// broken image.
function Favicon({
  domain,
  name,
  size,
}: {
  domain: string;
  name: string;
  size: "sm" | "md";
}) {
  const [failed, setFailed] = useState(false);
  const box = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (failed) {
    return (
      <span
        aria-hidden="true"
        className={`${box} flex shrink-0 items-center justify-center rounded bg-neutral-800 text-[10px] font-semibold text-neutral-300`}
      >
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`}
      alt=""
      width={size === "sm" ? 16 : 20}
      height={size === "sm" ? 16 : 20}
      className={`${box} shrink-0 rounded`}
      onError={() => setFailed(true)}
    />
  );
}

export function ProjectSwitcher({
  projects,
  activeSlug,
}: {
  projects: SwitcherProject[];
  activeSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = projects.find((p) => p.slug === activeSlug) ?? projects[0];

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Separator after the brand - the brand only renders in the topbar on
          mobile (desktop shows it in the sidebar), so hide the slash on md+. */}
      <span aria-hidden="true" className="text-neutral-700 md:hidden">
        /
      </span>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 disabled:opacity-50"
      >
        {active ? <Favicon domain={active.domain} name={active.name} size="sm" /> : null}
        {active?.domain ?? "select project"}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`h-3 w-3 text-neutral-600 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-neutral-800 bg-neutral-900 p-1 shadow-xl shadow-black/40"
        >
          {projects.map((p) => {
            const isActive = p.slug === active?.slug;
            return (
              <button
                key={p.slug}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  if (isActive) return;
                  // switchProject writes the dash_project cookie and
                  // revalidatePath("/", "layout"). That reliably refreshes the
                  // layout subtree (this switcher's own label) but can leave the
                  // client Router Cache serving the PAGE segment stale - so the
                  // header showed the new project while the body still rendered
                  // the previous one's data. router.refresh() re-fetches the
                  // current route so layout + page re-render together against
                  // the new cookie. The extra render is worth never showing a
                  // mismatched project. The transition stays pending until the
                  // refresh resolves, so the button's disabled state covers it.
                  start(async () => {
                    await switchProject(p.slug);
                    router.refresh();
                  });
                }}
                className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-800"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Favicon domain={p.domain} name={p.name} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-neutral-100">{p.name}</span>
                    <span className="block truncate text-xs text-neutral-500">{p.domain}</span>
                  </span>
                </span>
                {isActive ? (
                  <span aria-hidden="true" className="text-emerald-400">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
          <div className="my-1 border-t border-neutral-800" />
          <Link
            href="/new"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            + Add project
          </Link>
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            Project settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
