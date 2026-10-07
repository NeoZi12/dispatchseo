// The four jobs a beginner needs a tool for, each with one free pick and the
// one thing that pick won't do. Shown right after the answer so the guide's
// whole recommendation is scannable before the detail sections.

const ICON = "h-5 w-5";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l3.5-4.5" />
      <circle cx="12" cy="15" r="1" />
    </svg>
  );
}

function PlugIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M9 3v5M15 3v5" />
      <path d="M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v4" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

const JOBS = [
  {
    icon: <SearchIcon />,
    job: "Find what to write about",
    pick: "Google autocomplete + Keyword Planner",
    limit: "Volumes come as ranges, and Keyword Planner needs a Google Ads account first.",
  },
  {
    icon: <PlugIcon />,
    job: "Get Google to see your site",
    pick: "Google Search Console",
    limit: "Only reports on a site you've verified - nothing about competitors.",
  },
  {
    icon: <GaugeIcon />,
    job: "Know where you rank",
    pick: "The Search Console performance report",
    limit: "Average position per query, not a daily live check of one keyword.",
  },
  {
    icon: <PenIcon />,
    job: "Write the page",
    pick: "Your own words, plus the search results page",
    limit: "No score telling you the page is good - you judge it against page 1.",
  },
] as const;

export function BeginnerFourJobsGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {JOBS.map((j) => (
        <div key={j.job} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {j.icon}
            <h3 className="text-[15px] font-semibold text-neutral-100">{j.job}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">Free pick</p>
          <p className="mt-1 text-sm font-medium text-neutral-100">{j.pick}</p>
          <p className="mt-2.5 text-sm leading-relaxed text-neutral-300">{j.limit}</p>
        </div>
      ))}
    </div>
  );
}
