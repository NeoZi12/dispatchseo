import type { Metadata } from "next";
import Link from "next/link";

// Docs landing - the Quickstart. Its whole job is routing: three install
// paths, then the two setup steps every path converges on. Deliberately
// light on prose - the card grid IS the information architecture, same
// pattern Postiz's own quickstart uses.

export const metadata: Metadata = {
  title: "Docs - DispatchSEO",
  description: "Get DispatchSEO running, then hand it to your agent.",
  alternates: { canonical: "/docs" },
};

function ContainerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M4 7.5L12 12l8-4.5M12 12v9" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="13" width="18" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const INSTALL_PATHS = [
  {
    href: "/docs/docker-compose",
    icon: ContainerIcon,
    title: "Your own computer",
    description: "One command, no cloud accounts.",
    recommended: true,
  },
  {
    href: "/docs/vps",
    icon: ServerIcon,
    title: "A VPS or server",
    description: "One line installs everything, HTTPS included.",
  },
  {
    href: "/docs/local-development",
    icon: TerminalIcon,
    title: "From source",
    description: "For contributors, with pnpm.",
  },
];

const THEN_STEPS = [
  { href: "/docs/search-console", title: "Connect Search Console" },
  { href: "/docs/connect-your-site", title: "Connect your site" },
];

export default function DocsQuickstart() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Quickstart</h1>
      <p className="mt-3 max-w-lg text-neutral-400">
        Get DispatchSEO running, then hand it to your agent.
      </p>

      <p className="mt-12 mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        Choose your install
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {INSTALL_PATHS.map(({ href, icon: Icon, title, description, recommended }) => (
          <Link
            key={href}
            href={href}
            className="group relative flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 outline-none transition-colors hover:border-neutral-700 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            {recommended && (
              <span className="absolute top-5 right-5 rounded border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-violet-300">
                Start here
              </span>
            )}
            <span className="flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Icon />
            </span>
            <span>
              <span className="block font-medium text-neutral-100">{title}</span>
              <span className="mt-1 block text-sm text-neutral-400">{description}</span>
            </span>
          </Link>
        ))}
      </div>

      <p className="mt-12 mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500">
        Then
      </p>
      <div className="divide-y divide-neutral-800 overflow-hidden rounded-xl border border-neutral-800">
        {THEN_STEPS.map((step, i) => (
          <Link
            key={step.href}
            href={step.href}
            className="group flex items-center justify-between gap-3 px-5 py-3.5 outline-none transition-colors hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-violet-400/70 focus-visible:ring-inset"
          >
            <span className="flex items-center gap-3">
              <span className="font-mono text-sm text-neutral-600">{i + 1}</span>
              <span className="text-sm font-medium text-neutral-200">{step.title}</span>
            </span>
            <span
              aria-hidden="true"
              className="text-neutral-600 transition-transform group-hover:translate-x-0.5 group-hover:text-neutral-400"
            >
              →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
