// Frase's own pricing page, fetched live while writing this guide (frase.io/pricing).
// The number every "frase alternative" roundup skips: Content Guard, the
// ranking-decay monitor, only watches a fixed page count per tier - 10, 75,
// or 300 - not "everything you publish." Enterprise's cap isn't published,
// so it's left blank here rather than guessed.

const TIERS = [
  {
    name: "Starter",
    price: "$39/mo",
    priceNote: "billed yearly, $49 month-to-month",
    seats: "1 seat, 1 site",
    articles: "10 articles/mo",
    capPages: 10,
    capBarPct: 3,
  },
  {
    name: "Professional",
    price: "$103/mo",
    priceNote: "billed yearly, $129 month-to-month",
    seats: "3 seats, 5 sites",
    articles: "40 articles/mo",
    capPages: 75,
    capBarPct: 25,
  },
  {
    name: "Scale",
    price: "$239/mo",
    priceNote: "billed yearly, $299 month-to-month",
    seats: "5 seats, up to 10 domains",
    articles: "100 articles/mo",
    capPages: 300,
    capBarPct: 100,
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceNote: "white-label, SSO/SAML, dedicated account manager",
    seats: "Custom seats and domains",
    articles: "Custom article volume",
    capPages: null,
    capBarPct: 0,
  },
] as const;

export function FraseTierCapScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {TIERS.map((t) => (
        <div key={t.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-neutral-100">{t.name}</h3>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {t.price}
          </p>
          <p className="mt-1 text-xs text-neutral-500">{t.priceNote}</p>
          <dl className="mt-3 space-y-1 text-xs text-neutral-400">
            <div className="flex justify-between gap-2">
              <dt>Seats</dt>
              <dd className="text-neutral-300">{t.seats}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Drafting</dt>
              <dd className="text-neutral-300">{t.articles}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] uppercase tracking-wide text-neutral-600">
            Content Guard monitors
          </p>
          <p className="mt-1 text-lg font-semibold tabular-nums text-amber-300">
            {t.capPages ? `${t.capPages} pages` : "not published"}
          </p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${t.capBarPct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
