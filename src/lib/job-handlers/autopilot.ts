import { getProjectById, writerMode } from "@/lib/projects";
import { runAutopilotPass } from "@/lib/autopilot";
import type { Job } from "@/lib/jobs";

// One hosted project's autopilot pass, as a queue job.
//
// The daily cron (/api/cron/autopilot, 05:30 UTC) runs the same pass for
// every project. Until 2026-11-05 it was the ONLY thing that ran it, so a
// site connected at 06:00 UTC showed an empty dashboard for twenty-three
// hours before research even started - and the first hosted trial cancelled
// sixteen minutes after signup, on exactly that screen. The crawl job that
// setup queues at "You're connected" now queues this one as soon as the site
// profile exists (job-handlers/crawl.ts), so research and the first writer
// run start within minutes.
//
// Running the pass twice in a day is safe by design: research is floored at
// two days since the last run and stamps last_research_at, the scheduler
// counts the week's usage and the spacing, and every setup gap is a quiet
// skip. So the daily cron finding this project already researched is the
// normal case, not a race.
export async function runAutopilotJob(job: Job): Promise<void> {
  const project = await getProjectById(job.project_id);
  if (!project) return; // deleted since it was queued: a state, not a fault
  if (writerMode(project) !== "hosted") return;
  const pass = await runAutopilotPass(project);
  // A research error (a vendor fault, a budget ceiling) is worth the job's
  // retries; a skip ("setup incomplete", "profile pending") is a state the
  // owner's Home cards already explain, and the daily cron picks it up.
  if (pass.hadError) {
    const why = pass.research && "error" in pass.research ? pass.research.error : "the autopilot pass reported an error";
    throw new Error(why);
  }
}
