"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { anchorFor } from "@/lib/changelog";

// The release heads-up: one quiet line inside the dispatcher's briefing card
// on Home saying DispatchSEO itself got an update, linking straight to that
// release on /changelog. Deliberately understated - neutral, not the violet
// the setup banner owns, because this is news, not work waiting on the owner.
//
// This used to have a second shape, a full-width bar under the topbar on every
// other screen. Retired: it was one more banner on every install the morning
// after a release, saying what Home already said. Home is the one place now.
//
// The link opens in a NEW TAB: reading the changelog is a detour, not a
// destination, so the owner closes the tab and is back where they were with
// the dashboard untouched behind it.
//
// Dismissal hides the row immediately and records the version through
// /api/whats-new/seen with keepalive - the browser delivers that even if the
// page is navigating or closing, which a server action inside a transition is
// not guaranteed to survive. Once recorded, it stays gone until the NEXT
// release. Following the link counts as dismissing: you've seen it.
export function ChangelogBanner({ version, summary }: { version: string; summary: string }) {
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    void fetch("/api/whats-new/seen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
      keepalive: true,
    })
      // The router cache can still hold an RSC payload with the banner in it,
      // so a later back-navigation would flash it again even though the cookie
      // is set. Refreshing drops that copy.
      .then(() => router.refresh())
      .catch(() => {
        /* it'll ask again next load */
      });
  }

  return (
    <div>
      <div className="flex items-center gap-3 text-sm">
        <a
          href={`/changelog#${anchorFor(version)}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={dismiss}
          className="group flex min-w-0 flex-1 items-center gap-2.5 text-neutral-400 hover:text-neutral-200"
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/60"
            aria-hidden
          />
          <span className="min-w-0 truncate">
            {/* The dispatcher has already said it got an upgrade in its own
                words a line above - repeating "DispatchSEO has been updated"
                under that would be the announcement twice, once in each
                voice. The summary and the way out are the only parts this row
                still owes. */}
            <span className="text-neutral-500">{summary}</span>
          </span>
          <span className="shrink-0 whitespace-nowrap font-medium text-neutral-300 underline-offset-2 group-hover:underline">
            What&apos;s new →
          </span>
        </a>
        <button
          onClick={dismiss}
          aria-label="Dismiss update notice"
          className="shrink-0 rounded p-1 text-neutral-600 transition-colors hover:text-neutral-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
