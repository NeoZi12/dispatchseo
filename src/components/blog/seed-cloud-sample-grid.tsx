// A real sample of what this project's own DataForSEO account returned for
// keyword_ideas(seeds: ["blog post ideas"]) during the session that wrote
// this guide - the exact "seed keyword in, a cloud of ideas out" job
// AnswerThePublic does, run through DispatchSEO's own research tool instead.
// Volume and KD are the tool's real numbers, not estimated or staged.

const IDEAS = [
  { keyword: "blog post ideas", volume: 390, kd: 2 },
  { keyword: "how to come up with blog post ideas", volume: 70, kd: 6 },
  { keyword: "blog post ideas generator", volume: 50, kd: 16 },
  { keyword: "blogging topics for beginners", volume: 30, kd: 19 },
  { keyword: "lifestyle blog post ideas", volume: 30, kd: 0 },
  { keyword: "travel blog post ideas", volume: 20, kd: 0 },
  { keyword: "fitness blog post ideas", volume: 20, kd: 4 },
  { keyword: "book blog post ideas", volume: 20, kd: 0 },
  { keyword: "personal blog post ideas", volume: 20, kd: 6 },
  { keyword: "blog post ideas for business", volume: 10, kd: 60 },
] as const;

export function SeedCloudSampleGrid() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <h3 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        keyword_ideas(seeds: [&quot;blog post ideas&quot;]), dataforseo, pulled live
      </h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {IDEAS.map((idea) => (
          <div key={idea.keyword} className="flex items-center justify-between gap-3 rounded-lg bg-neutral-800/60 px-3 py-2">
            <span className="truncate text-sm text-neutral-200">{idea.keyword}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-500">
              vol {idea.volume} · kd {idea.kd}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Ten of the ideas this exact call returned, real volume and KD attached - lifestyle, travel,
        fitness, books, business, all mixed into one cloud from one seed. That spread is what a
        seed-to-ideas tool is actually good at: wide, not aimed at any one site.
      </p>
    </div>
  );
}
