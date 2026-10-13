// The sequence the guide recommends: which channel runs in which stretch of the
// first year, and what to expect from it. It is a plan, not measured data -
// the "expect" lines are deliberately qualitative and match what the guide
// claims about how long each channel takes to show anything.

const PHASES = [
  {
    when: "Months 1-3",
    run: "Launch channels + SEO foundations",
    expect: "A few early users from communities. Search Console verified, first pages indexed.",
  },
  {
    when: "Months 4-6",
    run: "Steady SEO and content, one topic",
    expect: "Impressions grow. Clicks are still small and mostly from your own name.",
  },
  {
    when: "Months 7-9",
    run: "Double down on the cluster Search Console shows",
    expect: "First non-brand clicks on pages that reached page 1 or 2.",
  },
  {
    when: "Months 10-12",
    run: "Test paid on the keywords that already convert",
    expect: "A cost per signup you can compare with what organic pages earn.",
  },
] as const;

export function MarketingTwelveMonthSequenceFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Channel sequence, first 12 months</p>
      <ol className="mt-3 grid gap-3 sm:grid-cols-4">
        {PHASES.map((p, i) => (
          <li key={p.when} className="relative rounded-lg bg-neutral-950/60 p-3">
            <div className="flex items-center gap-2 text-violet-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
              <span className="text-xs font-semibold uppercase tracking-wide">{p.when}</span>
            </div>
            <p className="mt-2 text-sm font-semibold text-neutral-100">{p.run}</p>
            <p className="mt-1 text-sm leading-relaxed text-neutral-400">{p.expect}</p>
            {i < PHASES.length - 1 && (
              <span className="absolute -right-2 top-1/2 hidden -translate-y-1/2 text-neutral-600 sm:block" aria-hidden="true">
                &rsaquo;
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
