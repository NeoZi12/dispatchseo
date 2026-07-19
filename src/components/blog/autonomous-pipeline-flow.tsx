// The actual run that produced this page - step names and config pulled
// straight from .github/workflows/seo-daily.yml and seo-auto-merge.yml, not a
// generic "CI runs and deploys" diagram. This is the pipeline running today.

const STEPS = [
  { label: "schedule: 0 5 * * *", detail: "GitHub fires seo-daily.yml - no human present" },
  { label: "guard job", detail: "skip if an seo-labeled PR is already open, or the dashboard paused guide builds" },
  { label: "preflight checks", detail: "verify the Claude token and the seo-manager MCP are reachable - fail loud, never a silent empty run" },
  { label: "anthropics/claude-code-action@v1", detail: "headless run, bypassPermissions, capped at 150 turns / 45 minutes" },
  { label: "get_instructions -> get_suggestions -> build", detail: "Claude reads the playbook and the queue, drafts the guide, opens a PR labeled seo" },
  { label: "seo-auto-merge.yml", detail: "merges automatically once every check is green - only for guide-shaped diffs" },
] as const;

export function AutonomousPipelineFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {STEPS.map((s, i) => {
        const last = i === STEPS.length - 1;
        return (
          <li key={s.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="font-mono text-sm text-neutral-100">{s.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{s.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
