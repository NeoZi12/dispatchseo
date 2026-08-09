// Moz Pro's own product structure - five distinct modules behind one login,
// not the single "alternative" most roundups review. Coverage marks are this
// project's honest self-assessment, not a claim Moz endorses; icons depict
// each module's job (a dial for a proprietary score, a net for a crawl), never
// a lettered chip standing in for the concept.

const MODULES = [
  {
    name: "Rank Tracker",
    job: "Daily keyword position checks across a tracked list",
    covered: true,
  },
  {
    name: "Site Crawl",
    job: "Crawls every page on a site for technical and on-page issues",
    covered: false,
  },
  {
    name: "Domain Authority",
    job: "Moz's own 1-100 score, built from Moz's link index",
    covered: false,
  },
  {
    name: "Link Explorer",
    job: "Backlink and referring-domain research across the open web",
    covered: false,
  },
  {
    name: "Keyword Explorer",
    job: "Keyword ideas, volume, and difficulty for planning content",
    covered: true,
  },
] as const;

function ModuleIcon({ name }: { name: (typeof MODULES)[number]["name"] }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-5 w-5",
    "aria-hidden": true,
  };
  switch (name) {
    case "Rank Tracker":
      return (
        <svg {...common}>
          <path d="M4 18V10M10 18V6M16 18v-5M21 3l-5.5 5.5L12 5 4 13" />
        </svg>
      );
    case "Site Crawl":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <path d="M12 12 4 6M12 12l8-6M12 12 4 19M12 12l8 7M4 6h16M4 19h16" />
        </svg>
      );
    case "Domain Authority":
      return (
        <svg {...common}>
          <path d="M4 15a8 8 0 0 1 16 0" />
          <path d="M12 15 15.5 9" />
          <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "Link Explorer":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="8" height="6" rx="3" />
          <rect x="13" y="9" width="8" height="6" rx="3" />
          <path d="M11 12h2" />
        </svg>
      );
    case "Keyword Explorer":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5" />
          <path d="M7 10h6" />
        </svg>
      );
  }
}

export function MozModuleCoverageGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {MODULES.map((m) => (
        <div key={m.name} className="flex gap-3 rounded-xl bg-neutral-900 p-4 sm:p-5">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
            <ModuleIcon name={m.name} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-neutral-100">{m.name}</h3>
              <span
                className={`shrink-0 text-xs font-medium uppercase tracking-wide ${
                  m.covered ? "text-emerald-400" : "text-neutral-500"
                }`}
              >
                {m.covered ? "DispatchSEO covers this" : "not in DispatchSEO"}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-300">{m.job}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
