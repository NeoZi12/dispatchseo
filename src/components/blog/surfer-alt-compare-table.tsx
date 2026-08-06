// Current entry pricing and product scope for Surfer and the four
// alternatives page 1 names most (NeuronWriter, Clearscope, Frase,
// MarketMuse) - fetched live from each vendor's own pricing page during the
// session that wrote this guide, not copied from another listicle. Frase's
// higher tiers genuinely auto-publish AI drafts, which the rest of page 1
// tends to flatten away - included here rather than smoothed over.

const ROWS = [
  {
    tool: "Surfer SEO",
    price: "$49-$999/mo",
    does: "Real-time term-coverage editor, content audit, topical map",
    ships: "No - you write and publish",
  },
  {
    tool: "NeuronWriter",
    price: "$23-$117/mo",
    does: "Term-coverage scoring; Gold tier adds one-click AI drafts",
    ships: "No - you export and publish",
  },
  {
    tool: "Clearscope",
    price: "$129-$399/mo",
    does: "Term-coverage recommendations, AI-prompt tracking",
    ships: "No - guidance only",
  },
  {
    tool: "Frase",
    price: "$39-$299/mo",
    does: "Scoring plus AI drafts; Scale tier auto-publishes to your CMS",
    ships: "Partly - no review step, no code diff",
  },
  {
    tool: "MarketMuse",
    price: "quote-based",
    does: "Topic research, content briefs, strategy docs",
    ships: "No - planning only",
  },
  {
    tool: "DispatchSEO",
    price: "$0 self-hosted",
    does: "Researches the keyword, drafts the page, opens a PR",
    ships: "Yes - as a reviewable PR, then tracks rank after",
  },
] as const;

export function SurferAltCompareTable() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Tool</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Entry price</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">What it actually does</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Ships the page?</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.tool} className={r.tool === "DispatchSEO" ? "bg-violet-500/5" : undefined}>
                <td className="border-b border-neutral-800 px-3 py-2 font-medium text-neutral-100">{r.tool}</td>
                <td className="border-b border-neutral-800 px-3 py-2 tabular-nums text-neutral-300">{r.price}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.does}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.ships}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
