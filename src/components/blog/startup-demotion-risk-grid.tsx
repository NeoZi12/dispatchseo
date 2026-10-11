// The three habits that get a young domain discounted, each with the signal it
// sends and the fix. Facts here come from this repo's own record: ten
// alternative pages in ten days (2026-08-15 to 08-24) followed by roughly a
// 99% impression loss the same week in Google's August 2026 spam update.

const RISKS = [
  {
    title: "A burst of thin pages",
    signal: "Many near-identical pages appear at once on a domain with no history.",
    fix: "Cap yourself at one page a day and make each one answer its query completely.",
  },
  {
    title: "Drifting off-topic",
    signal: "A site about one thing suddenly covers five unrelated subjects.",
    fix: "Stay inside one remit until a cluster earns impressions, then widen.",
  },
  {
    title: "Copied angles",
    signal: "Your page restates what page 1 already says, in the same order.",
    fix: "Add one thing none of them have: your own numbers, a tested command, a defended stance.",
  },
] as const;

export function StartupDemotionRiskGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {RISKS.map((r) => (
        <div key={r.title} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-amber-300">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M12 4l9 16H3z" />
              <path d="M12 10v4" />
              <circle cx="12" cy="17" r="0.6" />
            </svg>
            <h3 className="text-[15px] font-semibold text-neutral-100">{r.title}</h3>
          </div>
          <p className="mt-2 text-xs uppercase tracking-wide text-neutral-500">What Google sees</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-300">{r.signal}</p>
          <p className="mt-2.5 text-xs uppercase tracking-wide text-neutral-500">Instead</p>
          <p className="mt-1 text-sm leading-relaxed text-neutral-300">{r.fix}</p>
        </div>
      ))}
    </div>
  );
}
