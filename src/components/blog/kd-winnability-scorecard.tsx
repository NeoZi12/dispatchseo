// Two real DataForSEO pulls from the same session that wrote this guide, via
// this project's own account: keyword_ideas expanded from the obvious broad
// seed ("keyword research tool"), and check_serp on this guide's actual
// target. The gap between them - not the existence of either number alone -
// is the honest argument for why a keyword-research tool's job was always
// half the work: finding a term is easy, finding one a young site can
// actually win is the part a spreadsheet never filtered for.

const CARDS = [
  {
    name: "\"keyword research tool\" (the obvious broad seed)",
    price: "KD 81",
    barPct: 81,
    note: "5,400/mo - what a naive keyword-research pass reaches for first, and what dispatchseo.com has no chance of ranking for yet.",
  },
  {
    name: "\"long tail pro alternative\" (this guide's actual target)",
    price: "KD 5",
    barPct: 5,
    note: "90/mo - under the site's auto-approve line, pulled live the same session as the row above it.",
  },
  {
    name: "dispatchseo.com's own authority, right now",
    price: "DR 5",
    barPct: 5,
    note: "6 referring domains, 96 backlinks, 33 days old - the real ceiling a KD-81 term would run straight into.",
  },
] as const;

export function KdWinnabilityScorecard() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-3">
      {CARDS.map((c) => (
        <div key={c.name} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <h3 className="text-[15px] font-semibold text-neutral-100">{c.name}</h3>
          <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-neutral-100">
            {c.price}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full rounded-full bg-violet-500" style={{ width: `${c.barPct}%` }} />
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-neutral-500">{c.note}</p>
        </div>
      ))}
    </div>
  );
}
