import { checkCron } from "@/lib/cron-auth";
import { reportCronRun } from "@/lib/cron-alerts";
import { claimDue, complete, failJob, queueHealth, MAX_ATTEMPTS, type Job } from "@/lib/jobs";

// Drains the background work queue (src/lib/jobs.ts, migration 0056).
//
// Everything the new article flow does off the request path passes through
// here: crawling a customer's site, finishing an accepted draft into
// publishable HTML, posting it, and checking afterwards that the page is
// actually live. One route rather than four, because they share every hard
// part - claiming without double-running, backing off, giving up loudly - and
// four copies of that is four places for the same retry bug.
//
// HANDLERS LIVE WITH THEIR FEATURE, not here. This route only knows how to
// hand a job to the right function and how to record what happened. The
// registry below is the entire coupling.
//
// Failure contract, matching every other cron in this codebase:
//   - One job failing must never stop the others. Each is isolated.
//   - A job that can still be retried is NOT an error: it is backed off and
//     the run stays green. Reporting a transient blip as a failed cron run
//     puts a banner on someone's dashboard for something that fixed itself
//     ninety seconds later, which is how alert rails get ignored.
//   - A job that has EXHAUSTED its attempts is a real failure and reports as
//     one, because at that point nothing will retry it and an article is
//     sitting unpublished with nobody watching.

export const maxDuration = 300;

/** In-code deadline, deliberately under maxDuration: a handler the platform
 *  kills mid-run never reaches failJob, so its job wedges invisibly (claimed,
 *  attempts creeping up on each reclaim, never finished - see queueHealth's
 *  `wedged`). Racing the handler against our own clock keeps every timeout on
 *  the normal, visible failure path instead. The losing handler keeps running
 *  until the function freezes, which is fine: its claim is already released
 *  and its attempt recorded, and every handler tolerates a retry. */
const HANDLER_DEADLINE_MS = 240_000;

/** Deliberately typed as "returns nothing useful" - a handler either finishes
 *  or throws. Anything it wants remembered belongs in its own tables, not in
 *  a return value this route would have to understand. */
type Handler = (job: Job) => Promise<void>;

async function withDeadline(run: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      run,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`timed out after ${HANDLER_DEADLINE_MS / 1000}s`)),
          HANDLER_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Handlers are imported lazily, one dynamic import per kind, so a queue with
// nothing but publish jobs never loads the crawler (and a broken import in an
// unused feature cannot take the whole route down).
const HANDLERS: Record<string, () => Promise<Handler>> = {
  crawl: async () => (await import("@/lib/job-handlers/crawl")).runCrawlJob,
  finish: async () => (await import("@/lib/job-handlers/finish")).runFinishJob,
  publish: async () => (await import("@/lib/job-handlers/publish")).runPublishJob,
  verify: async () => (await import("@/lib/job-handlers/verify")).runVerifyJob,
  // One stage of a hosted-writer run (src/lib/writer/) - the pivot of
  // 2026-10-22, where our server writes the article instead of the owner's agent.
  write: async () => (await import("@/lib/job-handlers/write")).runWriteJob,
};

export async function GET(req: Request): Promise<Response> {
  const denied = await checkCron(req);
  if (denied) return denied;

  // Small batch per tick on purpose. The cron runs often; a big batch just
  // means one slow job (a 150-page crawl) starves everything behind it and
  // risks the function's own time limit taking the whole batch down with it.
  const jobs = await claimDue(5);

  const result: Record<string, unknown> = { claimed: jobs.length };
  let hadError = false;

  const outcomes = await Promise.allSettled(
    jobs.map(async (job) => {
      const load = HANDLERS[job.kind];
      if (!load) {
        // An unknown kind is a code/database mismatch, not a transient fault -
        // retrying it five times changes nothing. Burn its attempts at once so
        // it stops looking pending and starts looking broken, which is what it
        // is.
        await failJob({ ...job, attempts: MAX_ATTEMPTS }, `no handler for job kind "${job.kind}"`);
        return { id: job.id, kind: job.kind, outcome: "no-handler" as const };
      }
      try {
        const handler = await load();
        await withDeadline(handler(job));
        await complete(job.id);
        return { id: job.id, kind: job.kind, outcome: "done" as const };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await failJob(job, message);
        const exhausted = job.attempts >= MAX_ATTEMPTS;
        return {
          id: job.id,
          kind: job.kind,
          outcome: exhausted ? ("failed" as const) : ("retrying" as const),
          attempts: job.attempts,
          error: message,
        };
      }
    }),
  );

  const byKind: Record<string, { done: number; retrying: number; failed: number }> = {};
  for (const o of outcomes) {
    if (o.status !== "fulfilled") {
      // The isolation wrapper itself threw, which means recording the failure
      // failed too - the job stays claimed and its grace window will free it.
      hadError = true;
      continue;
    }
    const v = o.value;
    const bucket = (byKind[v.kind] ??= { done: 0, retrying: 0, failed: 0 });
    if (v.outcome === "done") bucket.done++;
    else if (v.outcome === "retrying") bucket.retrying++;
    else {
      bucket.failed++;
      hadError = true;
      // Name the job that gave up, with its error. A count alone sends whoever
      // reads the alert straight back to the database to find out which one.
      // The "gave up after N attempts" phrasing is load-bearing: it marks the
      // failure as URGENT to the alert rails (isUrgentCronFailure), because a
      // terminal give-up means an owner's article will never publish and
      // nothing will retry it - that must email on the first occurrence, not
      // wait out the banner policy's grace run.
      result[`failed_${v.id.slice(0, 8)}`] = {
        kind: v.kind,
        error: `gave up after ${MAX_ATTEMPTS} attempts: ${v.error}`,
      };
    }
  }
  if (Object.keys(byKind).length) result.by_kind = byKind;

  // Wedged rows (killed by the platform, not a thrown error, until attempts
  // ran out) are reported on EVERY tick while any exist - their discovery must
  // not depend on this tick having other work, because nothing else in the
  // product can see them.
  const queue = await queueHealth();
  result.queue = queue;
  if (queue.wedged > 0) {
    hadError = true;
    result.error =
      `${queue.wedged} queued job(s) are wedged: killed mid-run until their attempts ran out, ` +
      `so nothing will retry them - inspect the jobs table (finished_at null, attempts >= ${MAX_ATTEMPTS}) ` +
      `and requeue or delete the rows`;
  }

  console.log("[jobs]", JSON.stringify(result));
  // Claim-only when nothing was actually processed: an idle tick is not a run
  // worth counting against the staleness clock, same reasoning as the other
  // claim-marker crons. A tick that found wedged rows is a real outcome, never
  // claim-only - the claim marker would hide its error from the banner.
  await reportCronRun("jobs", result, hadError, jobs.length === 0 && queue.wedged === 0);
  return Response.json(result, { status: hadError ? 500 : 200 });
}
