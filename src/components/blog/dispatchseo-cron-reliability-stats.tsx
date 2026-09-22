// This project's own answer to "what carries a job when nobody's watching" -
// facts pulled from this repo's own CLAUDE.md and cron routes, not a
// background task or a routine, which is why they're worth showing here.

import { StatRow, BigStatTile } from "@/components/ui";

export function DispatchseoCronReliabilityStats() {
  return (
    <StatRow cols={4}>
      <BigStatTile
        title="One project's cron failing"
        value="Never kills the run"
        sub="Every cron loops all projects inside Promise.allSettled, so one site's failure can't stop the rest from completing"
      />
      <BigStatTile
        title="Any failure, anywhere in the loop"
        value="HTTP 500"
        sub="Every cron route returns 500 if anything failed, so it shows up in Vercel's own run log instead of exiting quietly green"
      />
      <BigStatTile
        title="Every run, pass or fail"
        value="Logged + alerted"
        sub="reportCronRun() writes to cron_runs; failures hit the dashboard's Home banner and a Resend email, debounced per job"
      />
      <BigStatTile
        title="Anything tighter than once a day"
        value="GitHub Actions"
        sub="Vercel's Hobby tier caps crons at 2 jobs run once daily, so higher-frequency work splits out to scheduled workflows"
      />
    </StatRow>
  );
}
