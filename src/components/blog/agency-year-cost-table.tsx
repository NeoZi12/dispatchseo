// What one year costs under each way of getting SaaS SEO done. The agency,
// freelancer and consultant rows are the monthly averages from the retainer
// chart times 12 (plain arithmetic). The pipeline row deliberately carries no
// invented price: it lists what you actually pay for, because the cost depends
// on the agent plan and keyword data the reader already has.

const ROWS = [
  { route: "Agency", year: "$38,508", basis: "$3,209 x 12", you: "Briefing, approvals, product access", they: "Strategy, writing, links, reporting" },
  { route: "Consultant", year: "$39,000", basis: "$3,250 x 12", you: "Execution of the plan", they: "Strategy and review" },
  { route: "Freelancer", year: "$16,176", basis: "$1,348 x 12", you: "Direction, keyword choices", they: "Writing and on-page work" },
  { route: "Your own pipeline", year: "Your agent plan + keyword data", basis: "No retainer", you: "Approving ideas, merging PRs", they: "Research, drafts, rank and Search Console checks run on a schedule" },
] as const;

export function AgencyYearCostTable() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl bg-neutral-900">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="p-4 font-medium">Route</th>
            <th className="p-4 font-medium">One year</th>
            <th className="p-4 font-medium">You still do</th>
            <th className="p-4 font-medium">They do</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r) => (
            <tr key={r.route} className="border-t border-neutral-800 align-top">
              <td className="p-4 font-semibold text-neutral-100">{r.route}</td>
              <td className="p-4">
                <span className="font-semibold text-violet-400">{r.year}</span>
                <span className="block text-xs text-neutral-500">{r.basis}</span>
              </td>
              <td className="p-4 text-neutral-300">{r.you}</td>
              <td className="p-4 text-neutral-300">{r.they}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
