// Which of the three ways to run Claude Code unattended actually fits a given
// job - background tasks (code.claude.com/docs/en/agent-view), routines
// (code.claude.com/docs/en/routines, see /blog/claude-code-routines-vs-cron),
// or infrastructure you own outright.

const TIERS = [
  {
    label: "Stepping away mid-task, this once",
    detail: "A background task (/bg) - your machine stays on, the supervisor holds the session, you reattach when it's done",
  },
  {
    label: "Recurring, no tighter than hourly, nothing to host",
    detail: "A Claude Code routine - Anthropic's cloud runs it, capped at 5-25 runs a day by plan, no claude.ai seat means no routine at all",
  },
  {
    label: "Sub-hourly, has to survive a reboot, needs retries or persisted state",
    detail: "A real external cron - Vercel's crons field or a GitHub Actions schedule: trigger, infrastructure you own and can retry yourself",
  },
] as const;

export function BgTaskTierDecisionFlow() {
  return (
    <ol className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      {TIERS.map((t, i) => {
        const last = i === TIERS.length - 1;
        return (
          <li key={t.label} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-xs font-medium tabular-nums text-violet-300">
                {i + 1}
              </span>
              {!last ? <div className="w-0.5 flex-1 rounded-full bg-neutral-800" /> : null}
            </div>
            <div className={last ? "pb-0.5" : "pb-4"}>
              <p className="text-sm font-medium text-neutral-100">{t.label}</p>
              <p className="mt-0.5 text-sm text-neutral-400">{t.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
