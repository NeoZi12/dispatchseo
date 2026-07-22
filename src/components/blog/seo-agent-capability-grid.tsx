// The four capabilities every "AI SEO agent" page claims, paired with what
// this project's own MCP server (46 tools, src/app/api/[transport]/route.ts)
// actually does for each one - real tool behavior, not the marketing gloss.

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function WrenchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z" />
    </svg>
  );
}

function RadarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M12 12 20 8" />
      <path d="M12 3v3" />
      <path d="M12 12a9 9 0 1 0 9-9" />
      <path d="M12 12a4.5 4.5 0 1 0 4.5-4.5" />
    </svg>
  );
}

const CAPABILITIES = [
  {
    icon: <SearchIcon />,
    title: "Research & strategy",
    claim: "Pulls keyword clusters and scores opportunities against competitor data.",
    real: "propose_suggestion writes a keyword, volume, KD, and a plain-text SERP rationale to a queue you can read - never a black-box score.",
  },
  {
    icon: <PenIcon />,
    title: "Content creation",
    claim: "Generates SEO-optimized drafts and briefs inside the vendor's editor.",
    real: "No content tool in the MCP at all. Claude Code drafts the MDX directly against this repo; the backend only records the result afterward.",
  },
  {
    icon: <WrenchIcon />,
    title: "Technical fixes",
    claim: "Applies meta tags and schema, some with one-click CMS pushes.",
    real: "No auto-push, ever. Every change ships as a pull request labeled seo that a human merges - nothing writes to the live site by itself.",
  },
  {
    icon: <RadarIcon />,
    title: "Monitoring & watchdog",
    claim: "Continuously tracks rankings and triggers a refresh when a page decays.",
    real: "Daily rank checks and hourly Search Console pulls feed get_rankings and get_site_stats; a stalled cron shows on get_cron_health, not silently.",
  },
] as const;

export function SeoAgentCapabilityGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CAPABILITIES.map((c) => (
        <div key={c.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {c.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{c.title}</h3>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{c.claim}</p>
          <p className="mt-2.5 border-t border-neutral-800/70 pt-2.5 text-xs leading-relaxed text-neutral-500">
            {c.real}
          </p>
        </div>
      ))}
    </div>
  );
}
