// Wincher's own product pages (wincher.com, fetched live while writing this
// guide) describe seven distinct modules behind one plan, not the single
// "rank tracker" most alternative roundups treat it as. The right column is
// this project's honest read of each module's own copy against one question -
// does it create content, or only measure/recommend against content that
// already exists. Icons depict each module's job; none is a lettered chip.

const MODULES = [
  {
    name: "Rank Tracker",
    job: "Daily Google position checks across a tracked keyword list",
    creates: "no",
  },
  {
    name: "Local Rank Tracker",
    job: "The same daily checks, scoped to geographic and map-pack results",
    creates: "no",
  },
  {
    name: "Keyword Explorer",
    job: "Keyword ideas by volume, intent, and difficulty, plus competitor terms",
    creates: "no",
  },
  {
    name: "On-Page SEO Checker",
    job: "Scores an existing page against top-ranking pages and recommends fixes",
    creates: "no",
  },
  {
    name: "SERP Benchmark",
    job: "Audits a page against Google's top 10 for the gaps between them",
    creates: "no",
  },
  {
    name: "AI Content Outliner",
    job: "Generates a content structure from a keyword and a brief description",
    creates: "partial",
  },
  {
    name: "Reporting & Automation",
    job: "Scheduled, white-label reports compiled from the data above",
    creates: "no",
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
    case "Local Rank Tracker":
      return (
        <svg {...common}>
          <path d="M12 21s-6.5-5.9-6.5-11a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11-6.5 11Z" />
          <circle cx="12" cy="10" r="2.2" />
        </svg>
      );
    case "Keyword Explorer":
      return (
        <svg {...common}>
          <circle cx="10" cy="10" r="6" />
          <path d="m20 20-5.5-5.5" />
        </svg>
      );
    case "On-Page SEO Checker":
      return (
        <svg {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M9 8h6M9 12l1.8 1.8L15 10" />
        </svg>
      );
    case "SERP Benchmark":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    case "AI Content Outliner":
      return (
        <svg {...common}>
          <rect x="5" y="3.5" width="14" height="17" rx="2" />
          <path d="M8.5 8h7M8.5 11.5h4.5M8.5 15h3" />
          <path d="M17.5 15.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7Z" />
        </svg>
      );
    case "Reporting & Automation":
      return (
        <svg {...common}>
          <path d="M5 20V4M5 20h14" />
          <path d="M8.5 20v-6M13 20v-9M17.5 20V8" />
        </svg>
      );
  }
}

const CREATES_LABEL: Record<(typeof MODULES)[number]["creates"], string> = {
  no: "measures or recommends only",
  partial: "drafts a structure, not a page",
};

export function WincherModuleContentGrid() {
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
                  m.creates === "partial" ? "text-amber-300" : "text-neutral-500"
                }`}
              >
                {CREATES_LABEL[m.creates]}
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-neutral-300">{m.job}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
