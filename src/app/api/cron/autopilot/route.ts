import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { listProjectsChecked, writerMode } from "@/lib/projects";
import { missingCredentials } from "@/lib/writer/models";
import { runAutopilotPass } from "@/lib/autopilot";

// The autopilot's daily pass (vercel.json 05:30 UTC; docker/cron/crontab on
// self-host). For every project in hosted-writer mode: the auto-pause check,
// weekly keyword research (immediately for a project never researched), and
// today's article if the plan's weekly quota and the 2-day spacing allow -
// see src/lib/autopilot/index.ts for the order and why.
//
// Quiet vs loud, per CLAUDE.md: a paused site, a lapsed plan, a site still
// mid-setup, a met quota, an empty idea queue are all informational skips
// ({ skipped }). Only a real fault (a DB write, every DataForSEO seed
// failing, startWriterRun throwing) marks the run failed and returns 500.
// Each project is isolated with Promise.allSettled - one site's failure never
// stops another's article. Agent-mode projects are skipped without a read.
//
// The writer's model keys are operator configuration: when a hosted project
// exists and the deploy has none, every site silently stops getting articles.
// That is reported ONCE per run, loudly, rather than per project.

// Research (up to 16 Labs calls + a few judge calls) and the profile call can
// stack up on a big install; the route bills nothing for idle wall clock.
export const maxDuration = 300;

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  const { projects, degraded } = await listProjectsChecked();
  const hosted = projects.filter((p) => writerMode(p) === "hosted");
  const now = new Date();
  const runs = await Promise.allSettled(hosted.map((p) => runAutopilotPass(p, now)));

  const result: Record<string, unknown> = { hosted_projects: hosted.length };
  let hadError = false;
  if (degraded) {
    // Same as daily-ranks: running on the synthetic fallback means real
    // tenants may be skipped - never report that as a success.
    hadError = true;
    result._projects_degraded = degraded;
  }
  if (hosted.length > 0) {
    const missing = missingCredentials();
    if (missing.length) {
      hadError = true;
      result._writer = { error: `the hosted writer has no model credentials on this deploy: ${missing.join("; ")}` };
    }
  }
  runs.forEach((r, i) => {
    const slug = hosted[i].slug;
    if (r.status === "fulfilled") {
      if (r.value.hadError) hadError = true;
      delete r.value.hadError;
      result[slug] = r.value;
    } else {
      hadError = true;
      result[slug] = { error: r.reason instanceof Error ? r.reason.message : String(r.reason) };
    }
  });

  console.log("[autopilot]", JSON.stringify(result));
  await reportCronRun("autopilot", result, hadError);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
