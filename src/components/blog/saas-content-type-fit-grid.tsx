// The four page types a SaaS founder can publish, with the buyer moment each
// serves and the risk of overdoing it. Cards, so the caution on "alternative"
// pages sits next to the types that don't carry it.

const TYPES = [
  { name: "How-to for the job", moment: "Buyer has the problem, no tool yet", risk: "Low - the safe default for most weeks", tone: "text-emerald-400" },
  { name: "Comparison", moment: "Buyer is choosing a category", risk: "Medium - needs first-hand detail", tone: "text-amber-300" },
  { name: "Alternative or migration", moment: "Buyer is leaving a tool", risk: "High in volume - this site shipped 17 and paid for it", tone: "text-rose-400" },
  { name: "Data-backed opinion", moment: "Buyer wants a defended answer", risk: "Low - but needs a real number", tone: "text-emerald-400" },
] as const;

export function SaasContentTypeFitGrid() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {TYPES.map((t) => (
        <div key={t.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <p className="text-sm font-semibold text-neutral-100">{t.name}</p>
          <p className="mt-1 text-sm text-neutral-400">{t.moment}</p>
          <p className="mt-3 text-xs uppercase tracking-wide text-neutral-500">Overuse risk</p>
          <p className={`mt-0.5 text-sm ${t.tone}`}>{t.risk}</p>
        </div>
      ))}
    </div>
  );
}
