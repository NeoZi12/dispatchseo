"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DispatchMark } from "@/components/logo";

// Vercel-style navigation: an icon sidebar on desktop (Sidebar), a horizontal
// scroller on mobile (MobileNav), and the centered current-page title shown in
// the topbar (PageTitle). All three share the same LINKS source of truth.

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

function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z" />
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
      { href: "/automations", label: "Automations", Icon: AutomationsIcon },
      { href: "/instructions", label: "Instructions", Icon: InstructionsIcon },
      { href: "/google", label: "Search Console", Icon: SearchConsoleIcon },
    ],
  },
];

// Flat view of the same links - the mobile scroller and the topbar title
// resolve against this, so the groups stay a desktop-sidebar concern.
const LINKS: NavLink[] = GROUPS.flatMap((g) => g.links);

const SETTINGS: NavLink = { href: "/settings", label: "Settings", Icon: SettingsIcon };

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

// Routes reachable outside the sidebar, so the topbar title still resolves.
const EXTRA_TITLES: { href: string; label: string }[] = [
  { href: "/settings", label: "Settings" },
  { href: "/new", label: "New project" },
  { href: "/playbook", label: "Backlinks" },
  { href: "/billing", label: "Billing" },
];

function isActive(href: string, pathname: string) {
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}

function SidebarLink({ link, pathname }: { link: NavLink; pathname: string }) {
  const active = isActive(link.href, pathname);
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-[15px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 ${
        active
          ? "bg-neutral-800 font-medium text-white"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      <link.Icon className={`h-5 w-5 shrink-0 ${active ? "text-white" : "text-neutral-500"}`} />
      {link.label}
    </Link>
  );
}

// A plain <a>, never a Next <Link>: /logout is a GET route handler that signs
// the user out, and <Link> would PREFETCH it - logging them out on hover. A
// full navigation is also what we want here (drops the client router cache
// after sign-out). No active state - it's an action, not a page.
function LogoutLink({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <a
      href="/logout"
      className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200"
    >
      <LogoutIcon className="h-4 w-4" />
      Log out
    </a>
  ) : (
    <a
      href="/logout"
      className="flex items-center gap-3.5 rounded-lg px-3.5 py-2.5 text-[15px] text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
    >
      <LogoutIcon className="h-5 w-5 shrink-0 text-neutral-500" />
      Log out
    </a>
  );
}

export function Sidebar({ billing = false }: { billing?: boolean }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-800/80 md:flex">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
        >
          <DispatchMark className="h-7 w-auto" />
          <span className="font-semibold tracking-tight">DispatchSEO</span>
        </Link>
      </div>
      {/* The groups scroll on short viewports (min-h-0 lets flex actually
          shrink this); Settings lives OUTSIDE the scroll area so it can
          never be clipped off the bottom of the screen. */}
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-3">
        {GROUPS.map((group, i) => (
          <div key={group.label ?? "top"} className="flex flex-col gap-1.5">
            {group.label ? (
              <p
                className={`px-3.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-neutral-600 ${
                  i > 0 ? "pt-5" : ""
                }`}
              >
                {group.label}
              </p>
            ) : null}
            {group.links.map((l) => (
              <SidebarLink key={l.href} link={l} pathname={pathname} />
            ))}
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-neutral-800/80 px-3 py-3">
        {billing ? <SidebarLink link={BILLING} pathname={pathname} /> : null}
        <SidebarLink link={SETTINGS} pathname={pathname} />
        <LogoutLink />
      </div>
    </aside>
  );
}

// Small screens can't fit a fixed sidebar - fall back to a horizontal
// scroller under the topbar with the same links and icons.
export function MobileNav({ billing = false }: { billing?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 pb-2 md:hidden">
      {[...LINKS, ...(billing ? [BILLING] : []), SETTINGS].map((l) => {
        const active = isActive(l.href, pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
              active
                ? "bg-neutral-800 font-medium text-white"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
            }`}
          >
            <l.Icon className="h-4 w-4" />
            {l.label}
          </Link>
        );
      })}
      <LogoutLink compact />
    </nav>
  );
}

// Centered current-page title in the topbar, Vercel-style.
export function PageTitle() {
  const pathname = usePathname();
  const match = [...LINKS, ...EXTRA_TITLES]
    .filter((l) => isActive(l.href, pathname))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <span className="text-sm font-medium text-neutral-200">{match?.label ?? ""}</span>
  );
}
