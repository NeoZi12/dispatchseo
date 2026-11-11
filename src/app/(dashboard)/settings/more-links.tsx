import Link from "next/link";
import { isCloudMode } from "@/lib/cloud";
import { cx, FOCUS_RING } from "@/components/ui/styles";

// Billing, Feedback and Docs: the pages that used to be rows of their own at
// the foot of the sidebar and are reached from Settings instead (owner,
// 2026-11-11). One list, so the hosted Settings nav, the agent-mode Settings
// page and the no-site Settings page can't drift apart. The sidebar keeps its
// Settings row lit on /billing and /feedback (nav.tsx UNDER_SETTINGS), and
// those two pages carry BackToSettings, so they read as part of Settings
// rather than as pages you fell out of it to reach.
export type MoreLink = { href: string; label: string; external?: boolean };

export function moreLinks(): MoreLink[] {
  return [
    // Cloud only - self-host has nothing to bill.
    ...(isCloudMode() ? [{ href: "/billing", label: "Billing" }] : []),
    { href: "/feedback", label: "Feedback" },
    // A new tab: reading a doc is a side quest, and losing a half-filled
    // Settings form to it is a bad trade.
    { href: "/docs", label: "Docs", external: true },
  ];
}

export function OutArrow({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17 17 7M9 7h8v8" />
    </svg>
  );
}

/** One entry, as a link that fills whatever box the caller styles. */
export function MoreLinkAnchor({ link, className }: { link: MoreLink; className: string }) {
  if (link.external) {
    return (
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={className}>
        {link.label}
        <OutArrow className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {link.label}
    </Link>
  );
}

/** The same entries as a row of chips, for the Settings pages that have no
 *  section list of their own (agent mode, and an account with no site). */
export function MoreLinksRow() {
  return (
    <nav aria-label="More" className="flex flex-wrap gap-1.5">
      {moreLinks().map((link) => (
        <MoreLinkAnchor
          key={link.href}
          link={link}
          className={cx("inline-flex items-center gap-1.5 rounded-lg border border-line-soft px-3 py-2 text-[14px] text-ink-muted transition-colors hover:bg-surface hover:text-ink", FOCUS_RING)}
        />
      ))}
    </nav>
  );
}

/** The way back, above the title of a page that lives under Settings. */
export function BackToSettings() {
  return (
    <Link
      href="/settings"
      className={cx("inline-flex items-center gap-1 rounded-md text-[13px] text-ink-muted transition-colors hover:text-ink", FOCUS_RING)}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M15 6l-6 6 6 6" />
      </svg>
      Settings
    </Link>
  );
}
