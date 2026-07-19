"use client";

// A quiet disclosure card for the Trends screen: collapsed by default so a
// wall of trend cards stays scannable. Same rectangle grammar as every other
// card (rounded-xl bg-neutral-900); the only affordances are a neutral
// chevron in the corner and an optional teaser line that also opens the card.
//
// Slots, in render order:
//   header   - always visible (badges, title, short status lines)
//   teaser   - collapsed-only hint of what's inside; clicking it expands
//   children - the long part, hidden until opened
//   actions  - always visible at the bottom (decide buttons), OUTSIDE the
//              toggle so clicking them never collapses/expands the card

import { useId, useState } from "react";

export function CollapsibleCard({
  header,
  teaser,
  toggleLabel = "Show details",
  actions,
  children,
}: {
  header: React.ReactNode;
  teaser?: React.ReactNode;
  toggleLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-3">{header}</div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          aria-label={open ? "Hide details" : toggleLabel}
          onClick={() => setOpen((o) => !o)}
          className="-mr-1.5 -mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`h-4 w-4 transition-transform motion-reduce:transition-none ${
              open ? "rotate-180" : ""
            }`}
          >
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {!open && teaser ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(true)}
          className="mt-3 block text-left text-sm text-sky-400 hover:text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          {teaser}
        </button>
      ) : null}

      <div id={id} hidden={!open} className="mt-3 space-y-3">
        {children}
      </div>

      {actions ? <div className="mt-3">{actions}</div> : null}
    </div>
  );
}
