import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { listProjectsChecked, writerMode, type Project } from "@/lib/projects";
import { missingCredentials } from "@/lib/writer/models";
import { runAutopilotPass } from "@/lib/autopilot";
import { rebalanceOwnerShares } from "@/lib/site-shares";

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
// Multi-site plans (2026-11-11): one owner's sites share one monthly pool.
// Every pass still runs in parallel (pause check, research, the rewrite
// probe, backlog promotion - the slow parts), but the SCHEDULER step, the
// only one that starts an article, joins a per-owner queue: that owner's
// rebalance first (site-shares.ts, once), then their sites' scheduler calls
// one at a time, so two of them can never both read the pool as unused in
// the same instant. Ownerless projects schedule directly, as before.
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
  // One promise chain per owner, headed by that owner's rebalance (never
  // throws; a failure leaves last shares, a valid split). Each scheduler call
  // joins the tail; a link that rejects is caught for the CHAIN only - its
  // own caller still gets the rejection - so one site's failure never stops
  // its siblings' turn. Each call then reads its share fresh (projectPlan ->
  // readOwnedSites; projectHint carries no share, so nothing stale serves one).
  const chains = new Map<string, Promise<unknown>>();
  for (const p of hosted) {
    if (p.owner_user_id && !chains.has(p.owner_user_id)) {
      chains.set(p.owner_user_id, rebalanceOwnerShares(p.owner_user_id, now).catch(() => undefined));
    }
  }
  const scheduleFor =
    (ownerId: string) =>
    <T>(fn: () => Promise<T>): Promise<T> => {
      const link = (chains.get(ownerId) ?? Promise.resolve()).then(() => fn());
      chains.set(ownerId, link.catch(() => undefined));
      return link;
    };
  const runs = await Promise.allSettled(
    hosted.map((p: Project) => runAutopilotPass(p, now, p.owner_user_id ? { schedule: scheduleFor(p.owner_user_id) } : {})),
  );

  const result: Record<string, unknown> = { hosted_projects: hosted.length };
  let hadError = false;
  // Runs parked on the subscription writer are swept by /api/cron/jobs every
  // 5 minutes (failStaleAgentRuns) - a daily sweep here left them ~48h.
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
