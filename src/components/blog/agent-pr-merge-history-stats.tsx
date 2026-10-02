// The last 40 merged `seo` PRs on this repo, counted with `gh pr list --state
// merged --label seo --limit 40` on 2026-10-02 (first opened 2026-08-17). Every
// value is a pasted result of that query, not an estimate.

const STATS = [
  { value: "40", label: "merged agent PRs counted", note: "2026-08-17 to 2026-10-01" },
  { value: "2.4 min", label: "median from PR opened to merged", note: "fastest 1.7 min, slowest 332.5 min" },
  { value: "4 of 40", label: "touched a file outside the allowed directories", note: "the path rule holds these for the owner" },
  { value: "15 of 40", label: "had a CodeRabbit check on them", note: "Vercel reported on all 40" },
] as const;

export function AgentPrMergeHistoryStats() {
  return (
    <div className="not-prose my-6 grid gap-3 sm:grid-cols-2">
      {STATS.map((s) => (
        <div key={s.label} className="rounded-xl bg-neutral-900 p-4 sm:p-5">
          <p className="font-mono text-2xl font-semibold text-violet-400">{s.value}</p>
          <p className="mt-1 text-sm text-neutral-200">{s.label}</p>
          <p className="mt-1 text-xs text-neutral-500">{s.note}</p>
        </div>
      ))}
    </div>
  );
}
