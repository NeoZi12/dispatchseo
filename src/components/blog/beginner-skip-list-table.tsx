// What a beginner can leave out of the stack for now, and the signal that
// says it's time to add it back. The guide's "what to skip" section in one
// scannable table - every cell is real DOM text.

const ROWS = [
  { tool: "All-in-one paid suites", why: "Built for dozens of sites and teams; most of the dashboard has nothing to show a site with a handful of pages.", back: "You manage several sites, or need competitor data weekly." },
  { tool: "Content scoring tools", why: "They grade a page against page 1, which only helps once you have a page worth grading.", back: "You publish steadily and want a second opinion on each draft." },
  { tool: "Backlink checkers", why: "Links matter, but outreach before you have pages worth linking to is wasted effort.", back: "You have pages ranking on page 2 and need links to push them up." },
  { tool: "Paid rank trackers", why: "Search Console already reports average position for every query you appear for.", back: "You track a fixed list daily, or need a city-level view." },
  { tool: "Browser SEO toolbars", why: "They add dense numbers with no way to act on them yet.", back: "You audit other people's pages often." },
] as const;

export function BeginnerSkipListTable() {
  return (
    <div className="not-prose my-6 overflow-x-auto rounded-xl bg-neutral-900">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-neutral-500">
            <th className="px-4 py-3 font-medium">Skip for now</th>
            <th className="px-4 py-3 font-medium">Why it can wait</th>
            <th className="px-4 py-3 font-medium">Add it back when</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {ROWS.map((r) => (
            <tr key={r.tool} className="align-top">
              <td className="px-4 py-3 font-medium text-neutral-100">{r.tool}</td>
              <td className="px-4 py-3 text-neutral-300">{r.why}</td>
              <td className="px-4 py-3 text-amber-300">{r.back}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
