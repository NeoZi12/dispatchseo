// The four jobs "GEO tool" gets used to mean, sorted by what the tool does
// and which one a small site needs first. This is the guide's spine in one
// glance: the product category is four different jobs under one label.

function GaugeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 18a8 8 0 1 1 16 0" />
      <path d="M12 18l4-6" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="m3.5 6 1.5 1.5L7 5M3.5 12l1.5 1.5L7 11M3.5 18l1.5 1.5L7 17" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z" />
      <path d="M14 7l3 3" />
    </svg>
  );
}

function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.3" />
      <path d="M17 14a5 5 0 0 1 4 6" />
    </svg>
  );
}

const JOBS = [
  {
    order: "1st",
    job: "Measure citations",
    does: "Asks AI engines your queries, logs whether they named you and who they named instead.",
    examples: "Search Console and Bing reports (free), Profound, Peec AI, SE Visible",
    icon: <GaugeIcon />,
    tone: "bg-emerald-400/10 text-emerald-300",
  },
  {
    order: "2nd",
    job: "Audit pages",
    does: "Scores a page against a checklist of AI-friendliness: structure, answer-first openings, crawl access.",
    examples: "Free graders, suite add-ons",
    icon: <ChecklistIcon />,
    tone: "bg-neutral-800 text-neutral-400",
  },
  {
    order: "3rd",
    job: "Generate content",
    does: "Drafts or rewrites pages meant to get cited. Writes text; does not measure whether it worked.",
    examples: "Writesonic, Frase, other AI writers",
    icon: <PenIcon />,
    tone: "bg-neutral-800 text-neutral-400",
  },
  {
    order: "Skip",
    job: "Agency retainer",
    does: "A person runs the first three for you and sends a monthly report.",
    examples: "Priced per month, not per query",
    icon: <PeopleIcon />,
    tone: "bg-amber-400/10 text-amber-300",
  },
] as const;

export function GeoToolJobSortGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {JOBS.map((j) => (
        <div key={j.job} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${j.tone}`}>{j.icon}</span>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-neutral-500">Need it {j.order}</p>
              <h3 className="text-sm font-medium text-neutral-100">{j.job}</h3>
            </div>
          </div>
          <p className="mt-3 text-sm text-neutral-300">{j.does}</p>
          <p className="mt-2 text-xs text-neutral-500">{j.examples}</p>
        </div>
      ))}
    </div>
  );
}
