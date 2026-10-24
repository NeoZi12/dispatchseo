"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import posthog from "posthog-js";
import { posthogReady } from "@/lib/posthog-client";
import { DispatchMark } from "@/components/logo";
import { FOCUS_RING } from "@/components/ui/styles";

// Vercel-style navigation: an icon sidebar on desktop (Sidebar), a slide-out
// drawer behind a hamburger on mobile (MobileNav), and the centered
// current-page title shown in the topbar (PageTitle). All three share the same
// LINKS source of truth.

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
    </svg>
  );
}

function AnalyticsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 3v17a1 1 0 0 0 1 1h17" />
      <path d="M7 14l4-4 4 3 5-6" />
    </svg>
  );
}

function TrendsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function KeywordsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12.6 2.6 21 11a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// The build queue: stacked rows, top one "next up".
function QueueIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
    </svg>
  );
}

// Articles their AI handed in, waiting to go out: a page with a pen on it.
function DraftsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M19 12V8l-6-6H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5" />
      <path d="M13 2v6h6" />
      <path d="M18.4 14.6a2 2 0 0 1 2.83 2.83L17.5 21.2 14 22l.8-3.5Z" />
    </svg>
  );
}

// Connecting an AI: a plug.
function ConnectIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 2v6M15 2v6" />
      <path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8Z" />
      <path d="M12 17v5" />
    </svg>
  );
}

function PagesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function ToolsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
    </svg>
  );
}

function BacklinksIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function AutomationsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 3 14h8l-1 8 11-14h-9l1-6Z" />
    </svg>
  );
}

// A sparkle mark for AI visibility - filled, so it carries the same visual
// weight as the filled accent dot in KeywordsIcon rather than reading as a
// thin outline among the stroke-only icons around it.
function AiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path
        d="M9.94 15.5a2 2 0 0 0-1.44-1.44l-6.13-1.58a.5.5 0 0 1 0-.96l6.13-1.58a2 2 0 0 0 1.44-1.44L11.52 2.35a.5.5 0 0 1 .96 0l1.58 6.15a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.15a.5.5 0 0 1-.96 0Z"
        fill="currentColor"
        stroke="none"
      />
      <path d="M19 3v3" />
      <path d="M20.5 4.5h-3" />
    </svg>
  );
}

function InstructionsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      <path d="M9 7h7M9 11h5" />
    </svg>
  );
}

function SearchConsoleIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 11h6M11 8v6" />
    </svg>
  );
}

// A megaphone for the product changelog - announcements, not settings.
function WhatsNewIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 11v2a1 1 0 0 0 1 1h2.5L13 18.5v-13L6.5 10H4a1 1 0 0 0-1 1Z" />
      <path d="M17 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M6.5 14v4a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2.2" />
    </svg>
  );
}

function DocsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 4.5h6a2 2 0 0 1 2 2v13a1.6 1.6 0 0 0-1.6-1.6H4z" />
      <path d="M20 4.5h-6a2 2 0 0 0-2 2v13a1.6 1.6 0 0 1 1.6-1.6H20z" />
    </svg>
  );
}

// A speech bubble with a spark: this is where you say something, and it's the
// one nav item that's an invitation rather than a screen full of your data.
function FeedbackIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
      <path d="M12 8.5v5" />
      <path d="M9.5 11h5" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
    </svg>
  );
}

function MenuIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function LogoutIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <path d="M21 12H9" />
    </svg>
  );
}

type NavLink = {
  href: string;
  label: string;
  Icon: (props: IconProps) => React.ReactNode;
  // Opens in its own tab and never reads as the current page - for surfaces
  // that live outside the dashboard (the public changelog).
  external?: boolean;
};

// Plain-English groups (PostHog-style): the label names what the pages are
// FOR, not how they're built. Home sits alone on top; Settings stays pinned
// at the bottom. Routes are unchanged - only labels moved/renamed.
type NavGroup = { label: string | null; links: NavLink[] };

const GROUPS: NavGroup[] = [
  { label: null, links: [{ href: "/dashboard", label: "Home", Icon: HomeIcon }] },
  {
    label: "Performance",
    links: [
      { href: "/analytics", label: "Analytics", Icon: AnalyticsIcon },
      { href: "/keywords", label: "Rankings", Icon: KeywordsIcon },
      { href: "/ai", label: "AI visibility", Icon: AiIcon },
    ],
  },
  {
    label: "Content",
    links: [
      { href: "/trends", label: "Trends", Icon: TrendsIcon },
      { href: "/research", label: "Queue", Icon: QueueIcon },
      // The stage between an approved idea and a published guide: what their
      // AI has handed in and what our side did with it.
      { href: "/drafts", label: "Drafts", Icon: DraftsIcon },
      { href: "/pages", label: "Guides", Icon: PagesIcon },
      { href: "/tools", label: "Tools", Icon: ToolsIcon },
    ],
  },
  {
    label: "Growth",
    links: [{ href: "/backlinks", label: "Backlinks", Icon: BacklinksIcon }],
  },
  {
    label: "System",
    links: [
      // First in System: connecting an AI is the first thing a new owner does,
      // and the page that explains the product should not be buried under the
      // pages that assume it is already running.
      { href: "/connect", label: "Connect your AI", Icon: ConnectIcon },
      { href: "/automations", label: "Automations", Icon: AutomationsIcon },
      { href: "/instructions", label: "Instructions", Icon: InstructionsIcon },
      { href: "/google", label: "Search Console", Icon: SearchConsoleIcon },
      // Opens in a new tab like What's new: reading a doc is a side quest, and
      // losing an in-progress dashboard page to it is a bad trade.
      { href: "/docs", label: "Docs", Icon: DocsIcon, external: true },
      { href: "/changelog", label: "What's new", Icon: WhatsNewIcon, external: true },
    ],
  },
];

// A hosted-writer project (our server writes and publishes) gets three
// screens, not sixteen: the report, the articles, the results. Everything
// else it controls lives in Settings. Agent projects keep GROUPS above.
export type NavMode = "hosted" | "agent";

function ReportIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 16v-3M12 16V8M16 16v-5" />
    </svg>
  );
}

const HOSTED_GROUPS: NavGroup[] = [
  {
    label: null,
    links: [
      { href: "/dashboard", label: "Overview", Icon: ReportIcon },
      { href: "/articles", label: "Articles", Icon: PagesIcon },
      { href: "/analytics", label: "Analytics", Icon: AnalyticsIcon },
      // Interactive tool pages; on Starter this is the page that says
      // they come with Growth and Scale.
      { href: "/tools", label: "Tools", Icon: ToolsIcon },
    ],
  },
];

function groupsFor(mode: NavMode): NavGroup[] {
  return mode === "hosted" ? HOSTED_GROUPS : GROUPS;
}

// Flat view of the same links - the mobile scroller and the topbar title
// resolve against this, so the groups stay a desktop-sidebar concern.
const LINKS: NavLink[] = GROUPS.flatMap((g) => g.links);
const HOSTED_LINKS: NavLink[] = HOSTED_GROUPS.flatMap((g) => g.links);

const SETTINGS: NavLink = { href: "/settings", label: "Settings", Icon: SettingsIcon };

// Pinned to the bottom next to Settings rather than dropped into a GROUP, for
// two reasons: it is about the product, not about this site (every GROUP above
// is one of your site's screens), and the groups are hidden entirely for an
// account with no site yet - which is exactly the person most likely to have
// something to tell us.
const FEEDBACK: NavLink = { href: "/feedback", label: "Feedback", Icon: FeedbackIcon };
// Hosted mode has no System group, so Docs joins the pinned rows.
const DOCS: NavLink = { href: "/docs", label: "Docs", Icon: DocsIcon, external: true };

function BillingIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

// Cloud deployments only - self-host has nothing to bill. The layout decides
// (isCloudMode is server-side) and passes `billing` down.
const BILLING: NavLink = { href: "/billing", label: "Billing", Icon: BillingIcon };

// The current plan, as a pill on the Billing row.
//
// It rides that row rather than sitting in the topbar for two reasons: the
// topbar already carries the project switcher, the page title, the agent
// switch and the mode switch, and at 390px it has nothing left to give; and
// the plan is ACCOUNT state, which is what the bottom group of the sidebar is
// - Feedback, Billing, Settings, Log out - while everything above it is one
// site's data. Clicking through lands on the page that can change it.
//
// A trial reads as emerald because it is time-boxed and worth noticing; a
// healthy plan stays neutral so it informs without competing with the nav; a
// dead one goes amber next to the banner already explaining it.
const PLAN_TONES: Record<PlanTone, string> = {
  trial: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  plan: "border-line bg-surface-2 text-ink-muted",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

export type PlanTone = "trial" | "plan" | "warn";
export type PlanChip = { label: string; tone: PlanTone };

function PlanPill({ plan }: { plan: PlanChip }) {
  return (
    <span
      className={`ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none ${PLAN_TONES[plan.tone]}`}
    >
      {plan.label}
    </span>
  );
}

// Routes reachable outside the sidebar, so the topbar title still resolves.
const EXTRA_TITLES: { href: string; label: string }[] = [
  { href: "/settings", label: "Settings" },
  { href: "/feedback", label: "Feedback" },
  { href: "/new", label: "New project" },
  { href: "/playbook", label: "Backlinks" },
  { href: "/billing", label: "Billing" },
];

function isActive(href: string, pathname: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

// Hosted mode has four screens, not sixteen, so its sidebar uses the room:
// bigger icons and labels, taller rows (owner, 2026-10-24).
const ROW = { normal: "gap-3 px-3 py-2 text-[14px]", big: "gap-3.5 px-3.5 py-2.5 text-[15.5px]" };
const ICON = { normal: "h-[18px] w-[18px]", big: "h-[22px] w-[22px]" };

function SidebarLink({
  link,
  pathname,
  trailing,
  big = false,
}: {
  link: NavLink;
  pathname: string;
  big?: boolean;
  // Right-aligned adornment for the row - the plan pill on Billing today. Only
  // honored on internal links; the external ones already end in their own
  // open-in-new-tab arrow.
  trailing?: React.ReactNode;
}) {
  const active = isActive(link.href, pathname);
  // External: a plain <a> in a new tab. No <Link> (nothing to prefetch off the
  // dashboard's router) and no active state - you never "are" on this page
  // while looking at the sidebar, since it lives in another tab.
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center rounded-lg ${ROW[big ? "big" : "normal"]} text-ink-muted transition-colors hover:bg-surface hover:text-ink ${FOCUS_RING}`}
      >
        <link.Icon className={`${ICON[big ? "big" : "normal"]} shrink-0 text-ink-faint`} />
        {link.label}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="ml-auto h-3.5 w-3.5 text-ink-faint/70"
          aria-hidden="true"
        >
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </a>
    );
  }
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center rounded-lg ${ROW[big ? "big" : "normal"]} transition-colors ${FOCUS_RING} ${
        active
          ? "bg-surface-2 font-medium text-ink before:absolute before:inset-y-2 before:-left-3 before:w-0.5 before:rounded-full before:bg-accent"
          : "text-ink-muted hover:bg-surface hover:text-ink"
      }`}
    >
      <link.Icon className={`${ICON[big ? "big" : "normal"]} shrink-0 ${active ? "text-accent" : "text-ink-faint"}`} />
      {link.label}
      {trailing}
    </Link>
  );
}

// A plain <a>, never a Next <Link>: /logout is a GET route handler that signs
// the user out, and <Link> would PREFETCH it - logging them out on hover. A
// full navigation is also what we want here (drops the client router cache
// after sign-out). No active state - it's an action, not a page.
//
// posthog.reset() on click, not just server-side cookie clearing: PostHog's
// own distinct-id/session state lives in the browser (localStorage/cookies),
// so on a shared computer the next person to sign in would otherwise be
// identify()'d on top of this person's still-linked PostHog identity
// (PostHogIdentify fires on every dashboard mount but never resets first).
function LogoutLink({ big = false }: { big?: boolean }) {
  return (
    <a
      href="/logout"
      onClick={() => {
        // No-op when analytics was declined - posthog-js is never initialised
        // in that case, and reset() on it throws, which would break logout.
        if (posthogReady()) posthog.reset();
      }}
      className={`flex items-center rounded-lg ${ROW[big ? "big" : "normal"]} text-ink-muted transition-colors hover:bg-surface hover:text-ink ${FOCUS_RING}`}
    >
      <LogoutIcon className={`${ICON[big ? "big" : "normal"]} shrink-0 text-ink-faint`} />
      Log out
    </a>
  );
}

// Every link in GROUPS resolves through getActiveProject(), which redirects to
// the wizard when the account owns nothing. Rendering them anyway gives a
// sidebar full of controls that silently teleport you to step 1. Settings and
// Billing both survive a zero-project account, so those stay.
function NoSiteNote() {
  return (
    <p className="px-3 py-3 text-sm leading-relaxed text-ink-faint">
      No site yet.{" "}
      <Link
        href="/onboarding?new=1"
        className="font-medium text-violet-400 underline underline-offset-2 hover:text-violet-300"
      >
        Add one
      </Link>{" "}
      to unlock the rest of the dashboard.
    </p>
  );
}

// The grouped links for the active project's mode. Sentence-case group
// names in a quiet tone: they orient, they don't shout.
function NavGroups({ mode, pathname }: { mode: NavMode; pathname: string }) {
  return (
    <>
      {groupsFor(mode).map((group, i) => (
        <div key={group.label ?? "top"} className={`flex flex-col ${mode === "hosted" ? "gap-1" : "gap-0.5"}`}>
          {group.label ? (
            <p className={`px-3 pb-1.5 text-[12px] font-medium text-ink-faint ${i > 0 ? "pt-6" : ""}`}>{group.label}</p>
          ) : null}
          {group.links.map((l) => (
            <SidebarLink key={l.href} link={l} pathname={pathname} big={mode === "hosted"} />
          ))}
        </div>
      ))}
    </>
  );
}

// Account-level rows, pinned under the scroll area so they can never be
// clipped off the bottom of a short screen.
function PinnedLinks({
  mode,
  pathname,
  billing,
  plan,
}: {
  mode: NavMode;
  pathname: string;
  billing: boolean;
  plan: PlanChip | null;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-t border-line-soft px-3 py-3">
      {mode === "hosted" ? <SidebarLink link={DOCS} pathname={pathname} big /> : null}
      <SidebarLink link={FEEDBACK} pathname={pathname} big={mode === "hosted"} />
      {billing ? (
        <SidebarLink link={BILLING} pathname={pathname} big={mode === "hosted"} trailing={plan ? <PlanPill plan={plan} /> : undefined} />
      ) : null}
      <SidebarLink link={SETTINGS} pathname={pathname} big={mode === "hosted"} />
      <LogoutLink big={mode === "hosted"} />
    </div>
  );
}

export function Sidebar({
  billing = false,
  hasProject = true,
  plan = null,
  mode = "agent",
}: {
  billing?: boolean;
  hasProject?: boolean;
  /** Which nav the active project gets (layout reads it via mode.ts). */
  mode?: NavMode;
  // Starter / Growth / Scale / Free trial. null on self-host, on a deployment
  // with billing unconfigured, and for an account that never subscribed.
  plan?: PlanChip | null;
}) {
  const pathname = usePathname();
  return (
    <aside className={`sticky top-0 hidden h-screen ${mode === "hosted" ? "w-64" : "w-60"} shrink-0 flex-col border-r border-line-soft bg-canvas md:flex`}>
      <div className="flex h-14 shrink-0 items-center px-4">
        {/* .dispatch-logo: the radio keys up (a quick wobble) on hover. */}
        <Link
          href="/dashboard"
          className={`dispatch-logo flex items-center gap-2 rounded-md ${FOCUS_RING}`}
        >
          <DispatchMark className={mode === "hosted" ? "h-8 w-auto" : "h-7 w-auto"} />
          <span className={`font-semibold tracking-tight ${mode === "hosted" ? "text-[17px]" : ""}`}>DispatchSEO</span>
        </Link>
      </div>
      {/* The groups scroll on short viewports (min-h-0 lets flex actually
          shrink this); Settings lives OUTSIDE the scroll area so it can
          never be clipped off the bottom of the screen. */}
      <nav className={`min-h-0 flex-1 overflow-y-auto px-3 pb-3 ${mode === "hosted" ? "pt-5" : "pt-3"}`}>
        {hasProject ? <NavGroups mode={mode} pathname={pathname} /> : <NoSiteNote />}
      </nav>
      <PinnedLinks mode={mode} pathname={pathname} billing={billing} plan={plan} />
    </aside>
  );
}

// Small screens can't fit a fixed sidebar. The previous fallback was a
// horizontal scroller under the topbar, but sixteen links meant swiping most
// of a screen-width to reach Settings, and it ate a second header row on the
// shortest viewports. Instead: a hamburger in the topbar opening a drawer that
// keeps the desktop sidebar's grouping, so the two navigations teach the same
// map of the app.
export function MobileNav({
  billing = false,
  hasProject = true,
  plan = null,
  mode = "agent",
}: {
  billing?: boolean;
  hasProject?: boolean;
  mode?: NavMode;
  plan?: PlanChip | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The overlay is portaled to <body>, so it can't render during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Navigating closes the drawer. Keyed on pathname rather than an onClick per
  // link so it also closes for a tap on the already-active route (which fires
  // no navigation at all).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While the drawer owns the screen: Escape closes it, and the page behind it
  // stops scrolling (otherwise a drag on the scrim scrolls the dashboard).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        className={`-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${FOCUS_RING}`}
      >
        <MenuIcon className="h-5 w-5" />
      </button>

      {/* Portaled to <body>, NOT rendered in place. The topbar this lives in
          has `backdrop-blur`, and a backdrop-filter makes an element the
          containing block for its fixed-position descendants - so an in-place
          overlay sized itself to the 390x56 header instead of the viewport,
          clipping the whole drawer to a strip. */}
      {open && mounted
        ? createPortal(
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setOpen(false)}
            className="dispatch-fade-in absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[1px]"
          />
          <div className="dispatch-slide-in absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-line bg-canvas shadow-2xl shadow-black/60">
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
              <Link href="/dashboard" className="dispatch-logo flex items-center gap-2">
                <DispatchMark className="h-7 w-auto" />
                <span className="font-semibold tracking-tight">DispatchSEO</span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className={`-mr-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink ${FOCUS_RING}`}
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>
            {/* Same groups as the desktop sidebar, and Settings likewise pinned
                outside the scroll area so it can't be clipped off the bottom. */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
              {hasProject ? <NavGroups mode={mode} pathname={pathname} /> : <NoSiteNote />}
            </nav>
            <PinnedLinks mode={mode} pathname={pathname} billing={billing} plan={plan} />
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

// Centered current-page title in the topbar, Vercel-style.
export function PageTitle({ mode = "agent" }: { mode?: NavMode }) {
  const pathname = usePathname();
  const match = [...(mode === "hosted" ? HOSTED_LINKS : LINKS), ...EXTRA_TITLES]
    .filter((l) => isActive(l.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <span className="text-sm font-medium text-ink">{match?.label ?? ""}</span>
  );
}
