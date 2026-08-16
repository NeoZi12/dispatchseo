// Serpstat's own current module list (serpstat.com, fetched live while
// writing this guide) - six jobs behind one login, not the single tool most
// "alternative" roundups review. Coverage marks are this project's honest
// self-assessment against its own MCP tools, not a claim Serpstat endorses;
// icons depict each module's actual job, never a lettered chip.

const MODULES = [
  {
    name: "Keyword Research",
    job: "Volume, difficulty, and CPC across 230 countries to plan what to target",
    covered: true,
  },
  {
    name: "Rank Tracker",
    job: "Daily position checks on a tracked list, weekly full-depth sweeps",
    covered: true,
  },
  {
    name: "Content Marketing",
    job: "AI-assisted briefs and drafts you open, prompt, and edit yourself",
    covered: true,
  },
  {
    name: "Backlink & Competitor Analysis",
    job: "Competitor backlink profiles and traffic across the open web",
    covered: false,
  },
  {
    name: "Site Audit",
    job: "Crawls every page on a connected site for technical and on-page issues",
    covered: false,
  },
  {
    name: "Keyword Clustering",
    job: "Groups a keyword list by thematic similarity for campaign planning",
    covered: false,
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
    case "Keyword Research":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5M7 10h6" />
        </svg>
      );
    case "Rank Tracker":
      return (
        <svg {...common}>
          <path d="M4 18V10M10 18V6M16 18v-5M21 3l-5.5 5.5L12 5 4 13" />
        </svg>
      );
    case "Content Marketing":
      return (
        <svg {...common}>
          <path d="M5 4h9l5 5v11H5z" />
          <path d="M14 4v5h5M8 13h8M8 16.5h5" />
        </svg>
      );
    case "Backlink & Competitor Analysis":
      return (
        <svg {...common}>
          <rect x="3" y="9" width="8" height="6" rx="3" />
          <rect x="13" y="9" width="8" height="6" rx="3" />
          <path d="M11 12h2" />
        </svg>
      );
    case "Site Audit":
      return (
        <svg {...common}>
          <path d="M9 11.5 3 17.5 6.5 21l6-6" />
          <path d="M12.5 8.5 16 5a3 3 0 1 1 3 3l-3.5 3.5" />
          <path d="m10 9-2-2" />
        </svg>
      );
    case "Keyword Clustering":
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="2" />
          <circle cx="6" cy="17" r="2" />
          <circle cx="17" cy="12" r="2.6" />
          <path d="M8 7.7 15 11M8 16.3 15 13" />
        </svg>
      );
  }
}

export function SerpstatModuleGrid() {
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
