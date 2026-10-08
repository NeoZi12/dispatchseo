// The price ladder for a small business's SEO tooling, from $0 to the
// all-in-one suites. Prices are read from the vendors' own pricing pages on
// the day this guide was written; the point is how steep the climb is
// compared with what a one-site business uses at each rung.

const RUNGS = [
  { tier: "Free", price: "$0", tools: "Google Search Console, Keyword Planner, Ahrefs Free", covers: "Indexing, queries, average position, topic ideas", width: "w-[8%]" },
  { tier: "Entry paid", price: "$29/mo", tools: "Ahrefs Starter", covers: "Adds paid-plan data on top of the free tier", width: "w-[22%]" },
  { tier: "Mid-range", price: "$129/mo", tools: "Ahrefs Lite (5 projects, 750 tracked keywords)", covers: "Rank tracking and competitor data for a few sites", width: "w-[60%]" },
  { tier: "Suite", price: "$139/mo", tools: "Semrush SEO (5 websites, 500 keywords tracked daily)", covers: "Everything in one login, sized for five sites", width: "w-[65%]" },
] as const;

export function SmallBusinessCostLadder() {
  return (
    <div className="not-prose my-6 space-y-3">
      {RUNGS.map((r) => (
        <div key={r.tier} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-neutral-100">{r.tier}</h3>
            <p className="text-lg font-semibold text-violet-400">{r.price}</p>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-neutral-800" aria-hidden="true">
            <div className={`h-1.5 rounded-full bg-violet-500 ${r.width}`} />
          </div>
          <p className="mt-3 text-sm font-medium text-neutral-100">{r.tools}</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-300">{r.covers}</p>
        </div>
      ))}
      <p className="text-xs text-neutral-500">Monthly prices from each vendor&apos;s pricing page, checked 2026-10-08. Ahrefs lists Lite under an annual-billing heading.</p>
    </div>
  );
}
