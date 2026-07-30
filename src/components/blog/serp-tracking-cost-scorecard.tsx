// DataForSEO's real current Google Organic SERP API pricing, fetched live
// from dataforseo.com/pricing/google-serp/google-organic-serp-api during the
// session that wrote this guide, plus this project's own real tracked-keyword
// count (get_rankings, 27 keywords) costed at the live-mode rate - not a
// hypothetical, the actual nightly bill for dispatchseo.com's own rank cron.

const CARDS = [
  {
    name: "Standard queue",
    price: "$0.6 / 1,000 SERPs",
    barPct: 30,
    note: "$0.0006 per call, ~5 min turnaround - the cheapest tier when nothing needs same-run freshness.",
  },
  {
    name: "Priority queue",
    price: "$1.2 / 1,000 SERPs",
    barPct: 60,
    note: "$0.0012 per call, up to 1 min turnaround - the middle tier most schedulers never actually need.",
  },
  {
    name: "Live mode",
    price: "$2 / 1,000 SERPs",
    barPct: 100,
    note: "$0.002 per call, ~6 sec average - what a same-session SERP check (like this guide's own gate) pays for.",
  },
  {
    name: "dispatchseo.com, tonight",
    price: "~$1.62/mo",
    barPct: 5,
    note: "27 keywords tracked, checked nightly on live mode - this project's own real rank-cron bill, not a projection.",
  },
] as const;

export function SerpTrackingCostScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CARDS.map((c) => (
        <div key={c.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-neutral-100">{c.name}</h3>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {c.price}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${c.barPct}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">{c.note}</p>
        </div>
      ))}
    </div>
  );
}
