// Feature matrix, not a price table - the surfer-seo-alternative guide
// already covers current pricing for this same shortlist. What page 1's
// "clearscope alternative" roundups don't track: which of these tools have
// quietly added AI-answer-engine citation tracking. Checked live against
// each vendor's own site/pricing page while writing this guide.

const ROWS = [
  { tool: "Clearscope", scores: "Yes", drafts: "Yes (Write module)", tracksCitations: "Yes (Expand module)", ships: "No" },
  { tool: "NeuronWriter", scores: "Yes", drafts: "Yes (Gold tier+)", tracksCitations: "Yes", ships: "No" },
  { tool: "Frase", scores: "Yes", drafts: "Yes", tracksCitations: "Yes (tiered by plan)", ships: "Partly - no review step" },
  { tool: "Surfer", scores: "Yes", drafts: "Yes", tracksCitations: "Yes (AI Tracker)", ships: "Announced, not shipped" },
  { tool: "MarketMuse", scores: "Yes", drafts: "Briefs only, not full drafts", tracksCitations: "No", ships: "No" },
  { tool: "DispatchSEO", scores: "No scoring step", drafts: "Yes", tracksCitations: "Yes (own tracking)", ships: "Yes - as a reviewable PR" },
] as const;

export function ScoreDraftTrackCompareTable() {
  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl bg-neutral-900">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Tool</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Term scoring</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">AI drafting</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">AI-citation tracking</th>
              <th className="border-b border-neutral-700 px-3 py-2 text-left font-medium text-neutral-200">Ships the page?</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.tool} className={r.tool === "DispatchSEO" ? "bg-violet-500/5" : undefined}>
                <td className="border-b border-neutral-800 px-3 py-2 font-medium text-neutral-100">{r.tool}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.scores}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.drafts}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.tracksCitations}</td>
                <td className="border-b border-neutral-800 px-3 py-2 text-neutral-300">{r.ships}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
