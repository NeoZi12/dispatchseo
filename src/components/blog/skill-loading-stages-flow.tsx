// The progressive-disclosure loading order for a skill, per
// platform.claude.com's current agent-skills docs - three stages, each with
// its own token cost, all landing in the SAME context window a subagent
// would instead wall off entirely.

const STAGES = [
  { label: "Level 1: metadata - always loaded", detail: "name and description sit in the system prompt from startup, ~100 tokens per skill, whether or not it ever gets used" },
  { label: "Level 2: instructions - loaded when triggered", detail: "Claude reads SKILL.md's body off disk the moment a request matches the description - under 5k tokens, and only then" },
  { label: "Level 3: resources and scripts - loaded as needed", detail: "reference files cost nothing until Claude opens one; a bundled script's code never enters context at all, only its output does" },
] as const;

export function SkillLoadingStagesFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STAGES.map((s, i) => {
        const last = i === STAGES.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-xs font-medium tabular-nums text-fuchsia-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
