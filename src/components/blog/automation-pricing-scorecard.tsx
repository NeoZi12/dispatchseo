// Entry pricing for running each tool as an always-on automation, not the
// interactive-editing headline price most comparisons quote - fetched live
// from claude.com/pricing and cursor.com/pricing during the session that
// wrote this guide.

const CARDS = [
  {
    name: "Claude Code (Pro)",
    price: "$20/mo",
    barPct: 20,
    note: "$17/mo billed annually. Includes Claude Code headless usage within the plan's limits.",
  },
  {
    name: "Claude Code (Max 5x/20x)",
    price: "from $100/mo",
    barPct: 100,
    note: "Higher usage ceiling for a session running unattended most of the day, e.g. a daily builder like this one.",
  },
  {
    name: "Cursor CLI (Pro)",
    price: "$20/mo",
    barPct: 20,
    note: "Same headline price as Claude Pro. Agent limits are the constraint that scales with automation volume.",
  },
  {
    name: "Cursor CLI (Teams)",
    price: "$40/user/mo",
    barPct: 40,
    note: "Standard tier, billed per seat - shared team context for cloud agents, not a per-automation price.",
  },
] as const;

export function AutomationPricingScorecard() {
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
