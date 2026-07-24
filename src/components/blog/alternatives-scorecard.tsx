// Real current entry pricing for the two named vendors this SERP's own
// listicles recommend most (seranking.com/blog/ahrefs-alternatives.html at
// #3, and Ahrefs' own pricing page as the thing being replaced) - fetched
// live from ahrefs.com/pricing and seranking.com/pricing.html during the
// session that wrote this guide, not copied from another listicle. The
// freemium row covers the rest of page 1 (Mangools, Ubersuggest, and
// similar) without inventing a number none of them publish plainly.

const CARDS = [
  {
    name: "Ahrefs",
    model: "Paid SaaS, tiered",
    price: "$129/mo",
    barPct: 100,
    note: "Lite tier - the cheapest paid seat. Standard runs $249/mo, Advanced $449/mo (ahrefs.com/pricing).",
  },
  {
    name: "SE Ranking",
    model: "Paid SaaS, tiered",
    price: "$103-129/mo",
    barPct: 80,
    note: "Core tier - $103.20/mo billed annually, $129/mo month to month (seranking.com/pricing.html).",
  },
  {
    name: "Freemium shortlist",
    model: "Freemium, capped",
    price: "$0 to start",
    barPct: 6,
    note: "Mangools, Ubersuggest, and the rest of page 1's actual picks - a metered taste built to convert you to a paid seat.",
  },
  {
    name: "DispatchSEO",
    model: "Self-hosted, agent-driven",
    price: "$0 software",
    barPct: 6,
    note: "Your own Vercel/Supabase + the Claude Code subscription you already pay for. DataForSEO usage is metered per project - you own the bill, not a vendor.",
  },
] as const;

export function AlternativesScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {CARDS.map((c) => (
        <div key={c.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-neutral-100">{c.name}</h3>
            <span className="text-xs uppercase tracking-wide text-neutral-500">{c.model}</span>
          </div>
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
