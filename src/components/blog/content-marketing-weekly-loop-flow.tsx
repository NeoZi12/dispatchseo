// The one-person content loop this guide recommends: four stages that repeat
// weekly, each with the single question it answers and the output it hands on.
// Shown as a horizontal flow with a "repeat" return arrow so the cycle reads at a glance.

const STAGES = [
  { name: "Research", ask: "What would a buyer type?", out: "One topic with a winnable page 1", icon: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-3.5-3.5" },
  { name: "Write", ask: "What does page 1 lack?", out: "One page with a number or config of yours", icon: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" },
  { name: "Publish", ask: "Is it indexed?", out: "A live URL in Search Console", icon: "M5 12l5 5 9-10" },
  { name: "Measure", ask: "Which queries gained position?", out: "Keep, refresh or kill the topic", icon: "M4 19V9m6 10V5m6 14v-7m4 7H2" },
] as const;

export function ContentMarketingWeeklyLoopFlow() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ol className="grid gap-3 sm:grid-cols-4">
        {STAGES.map((s, i) => (
          <li key={s.name} className="rounded-lg bg-neutral-950 p-3">
            <div className="flex items-center gap-2 text-violet-300">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d={s.icon} />
              </svg>
              <span className="text-xs tabular-nums text-neutral-500">{i + 1}</span>
              <p className="text-sm font-medium text-neutral-100">{s.name}</p>
            </div>
            <p className="mt-2 text-sm text-neutral-300">{s.ask}</p>
            <p className="mt-1 text-xs text-neutral-500">{s.out}</p>
          </li>
        ))}
      </ol>
      <p className="mt-3 flex items-center gap-1.5 text-xs uppercase tracking-wide text-neutral-500">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
        </svg>
        Repeat weekly - what Measure finds picks the next topic
      </p>
    </div>
  );
}
