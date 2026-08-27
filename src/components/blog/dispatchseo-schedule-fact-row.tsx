// Real counts from this repo during the run that wrote this guide: one
// vercel.json cron block plus every GitHub Actions workflow file carrying a
// `schedule:` trigger (grep -c "cron:" across .github/workflows/*.yml, plus
// vercel.json's own crons array). jobs.yml's */10 * * * * is the tightest of
// the twelve; 6 runs/hour x 24 = 144/day.

import { StatRow, BigStatTile } from "@/components/ui";

export function DispatchseoScheduleFactRow() {
  return (
    <div className="not-prose my-6">
      <StatRow cols={3}>
        <BigStatTile
          title="Scheduled triggers this repo runs"
          value="12"
          sub="1 Vercel cron + 11 GitHub Actions schedule: triggers"
        />
        <BigStatTile
          title="Tightest cadence"
          value="144/day"
          sub="jobs.yml fires every 10 minutes - one workflow, out of twelve"
        />
        <BigStatTile
          title="Highest published routine cap"
          value="25/day"
          sub="Team/Enterprise ceiling - Pro tops out at 5, Max at 15"
        />
      </StatRow>
    </div>
  );
}
