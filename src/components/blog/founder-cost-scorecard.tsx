// Real numbers, not list-price marketing copy - read from this repo's own
// src/lib/billing.ts (TIER_LIMITS) and src/lib/founding.ts (the 50%-off,
// first-50-sites offer, live through October 1, 2026) during the session
// that wrote this guide. Self-hosting has no seat to price at all.

const CARDS = [
  {
    name: "Self-hosted",
    price: "$0/mo",
    barPct: 0,
    note: "No seat, ever. You pay your own Vercel/Supabase/GitHub free tiers, the coding-agent subscription you already run, and DataForSEO metered to your own account.",
  },
  {
    name: "Cloud Starter (founding price)",
    price: "$24.50/mo",
    barPct: 25,
    note: "50% off, locked for life, for the first 50 sites through Oct 1, 2026 - one site included.",
  },
  {
    name: "Cloud Starter (list price)",
    price: "$49/mo",
    barPct: 49,
    note: "What Starter costs once the founding offer ends or its 50 seats are gone - still one site, hosted and managed.",
  },
] as const;

export function FounderCostScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {CARDS.map((c) => (
        <div key={c.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-neutral-100">{c.name}</h3>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {c.price}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${Math.max(c.barPct, 4)}%` }}
            />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">{c.note}</p>
        </div>
      ))}
    </div>
  );
}
