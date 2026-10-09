// The 12-month SaaS SEO plan as four phases, one card each: what the one
// person running it does and what the Search Console report usually shows.
// Phase contents are the guide's plan, not measurements. All text is DOM text.

const PHASES = [
  { months: "Months 1-2", name: "Foundation", do: "Verify Search Console, ship the sitemap, publish the 5-10 pages that match what buyers search", see: "Close to zero. Pages are still being discovered" },
  { months: "Month 3", name: "First signals", do: "Read the Performance report weekly, fix titles on pages with impressions and no clicks", see: "Impressions at positions 30-80, clicks in single digits" },
  { months: "Months 4-7", name: "Earning clicks", do: "Write commercial and comparison topics, one page a day at most, refresh anything near page 2", see: "A few queries reach page 2, then page 1" },
  { months: "Months 8-12", name: "Compounding", do: "Refresh winners, add internal links both ways, cluster new topics around what already ranks", see: "Clicks come from pages you wrote months ago" },
] as const;

export function SaasSeoYearPlanFlow() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {PHASES.map((p, i) => (
        <div key={p.months} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-violet-400" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Step {i + 1} - {p.months}</p>
          </div>
          <h3 className="mt-2 text-base font-semibold text-neutral-100">{p.name}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300"><span className="text-neutral-500">You: </span>{p.do}</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-300"><span className="text-neutral-500">Report shows: </span>{p.see}</p>
        </div>
      ))}
    </div>
  );
}
