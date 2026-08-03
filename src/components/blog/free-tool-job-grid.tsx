// The four jobs a "best free SEO tools" roundup always splits across -
// Screaming Frog and SerpApi limits verified live against their own current
// pricing/product pages while writing this guide, not copied from another
// listicle.

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CrawlIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 4v16" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l3.5-4.5" />
      <circle cx="12" cy="15" r="1" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
      <path d="M9 15l6-6" />
      <path d="M13 6.5 15 4.5a3.5 3.5 0 0 1 5 5l-2 2" />
      <path d="M11 17.5 9 19.5a3.5 3.5 0 0 1-5-5l2-2" />
    </svg>
  );
}

const JOBS = [
  {
    icon: <SearchIcon />,
    title: "Keyword research",
    example: "Google Keyword Planner",
    fact: "Real search-volume ranges pulled straight from Google's own ad auction - but the interface stays locked until you've created a Google Ads account, even at $0 spend.",
  },
  {
    icon: <CrawlIcon />,
    title: "Technical audit",
    example: "Screaming Frog SEO Spider, free version",
    fact: "500 URLs per crawl with no sign-up at all - past that, or past a crawl you want to save, it wants a license (verified on screamingfrog.co.uk).",
  },
  {
    icon: <GaugeIcon />,
    title: "Rank tracking",
    example: "A SERP API's free tier",
    fact: "SerpApi's own free plan caps at 250 searches a month and 50 an hour - enough to spot-check a handful of terms, not run a growing tracked list (serpapi.com/pricing).",
  },
  {
    icon: <LinkIcon />,
    title: "Backlinks & audits",
    example: "A vendor's own \"free tools\" page",
    fact: "Ahrefs, Moz, and SE Ranking each host one - single-purpose calculators built to lead you into their paid platform, not to run alongside each other.",
  },
] as const;

export function FreeToolJobGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {JOBS.map((j) => (
        <div key={j.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {j.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{j.title}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">{j.example}</p>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{j.fact}</p>
        </div>
      ))}
    </div>
  );
}
