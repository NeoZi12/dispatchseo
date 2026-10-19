// Average monthly SEO retainer by provider type, as reported in 2026 pricing
// round-ups that cite Ahrefs' survey of 439 providers. Shows how far apart a
// freelancer and an agency sit before any SaaS premium is added. Every number
// is real DOM text; the bars are scaled to the largest value ($3,250).

const ROWS = [
  { who: "Freelancer", monthly: 1348, label: "$1,348", width: "w-[41%]" },
  { who: "All provider types", monthly: 2917, label: "$2,917", width: "w-[90%]" },
  { who: "Agency", monthly: 3209, label: "$3,209", width: "w-[99%]" },
  { who: "Consultant", monthly: 3250, label: "$3,250", width: "w-full" },
] as const;

const SPREAD = [
  { share: "~43%", band: "under $1,500 a month", note: "mostly local-business SEO" },
  { share: "~48%", band: "$1,500 to $5,000 a month", note: "where most SaaS quotes land" },
  { share: "~5%", band: "over $5,000 a month", note: "enterprise scope" },
] as const;

export function AgencyRetainerAverageBars() {
  return (
    <div className="not-prose my-6 space-y-3">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Average monthly retainer</p>
        <ul className="mt-3 space-y-3">
          {ROWS.map((r) => (
            <li key={r.who}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-neutral-100">{r.who}</span>
                <span className="text-lg font-semibold text-violet-400">{r.label}</span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-neutral-800" aria-hidden="true">
                <div className={`h-1.5 rounded-full bg-violet-500 ${r.width}`} />
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {SPREAD.map((s) => (
          <div key={s.band} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
            <p className="text-2xl font-semibold text-violet-400">{s.share}</p>
            <p className="mt-1 text-sm font-medium text-neutral-100">of agencies charge {s.band}</p>
            <p className="mt-1 text-sm text-neutral-400">{s.note}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-neutral-500">Figures as relayed by 2026 pricing guides citing Ahrefs&apos; survey of 439 SEO providers; the guides disagree on some slices, so treat these as anchors, not quotes.</p>
    </div>
  );
}
