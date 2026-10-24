import { MAX_ATTEMPTS, type Job } from "@/lib/jobs";
import { failRun, getWriterRun, queueStage, saveScratch, type Stage } from "@/lib/writer/runs";
import { runStage } from "@/lib/writer/stages";

// One hosted-writer run, as many stages as fit in one handler.
//
// Every stage persists through advanceRun (compare-and-set) and queues the
// next stage as its own job, so crash-resumability never depends on this
// loop. The loop only removes the wait: without it each stage sits until the
// next cron tick (5 minutes), and an article takes most of an hour; with it,
// pick + research + plan run in one tick and write + verify in the next.
// The queued job for a stage this loop already ran finds the run past it
// and becomes a no-op (or a repair - see below).
//
// Three guarantees beyond "run the stage":
//
//   - A run that has moved past this job's stage is left alone - but if it
//     is still running, the job for its CURRENT stage is (re)queued. That is
//     the repair path for an enqueue that failed last time: queueStage is a
//     no-op when the job exists, so this costs nothing when all is well.
//   - A stage that throws on the job's LAST attempt ends the run as failed
//     before the throw propagates, so the run never stays 'running' with
//     nothing behind it, holding its idea's lock forever.
//   - Each stage gets the handler's deadline, so every model call sizes
//     itself to the time actually left.

/** Under the jobs route's 240s handler deadline, with room for the final
 *  save and enqueue. */
const STAGE_BUDGET_MS = 220_000;

/** What a stage usually needs; the loop only starts a stage that fits. */
const ESTIMATE_MS: Record<Exclude<Stage, "done">, number> = {
  pick: 10_000,
  research: 60_000,
  plan: 40_000,
  write: 120_000,
  verify: 90_000,
};

export async function runWriteJob(job: Job): Promise<void> {
  const runId = String(job.payload.runId ?? "");
  const stage = String(job.payload.stage ?? "");
  if (!runId) throw new Error("write job is missing its run");
  const deadline = Date.now() + STAGE_BUDGET_MS;
  let run = await getWriterRun(job.project_id, runId);
  if (!run) return; // deleted since it was queued: a state, not a fault
  if (run.status !== "running") return;
  if (run.stage !== stage) {
    if (run.stage !== "done") await queueStage(run.project_id, run.id, run.stage);
    return;
  }
  for (;;) {
    const current = run.stage;
    try {
      await runStage(run, deadline);
    } catch (err) {
      // Only the job's OWN stage spends this job's attempts. A chained later
      // stage has its own pending job with all its attempts left, so its
      // failure must not end the run on this job's count.
      if (current === stage && job.attempts >= MAX_ATTEMPTS) {
        const message = err instanceof Error ? err.message : String(err);
        await failRun(run, `gave up at stage ${run.stage} after ${job.attempts} attempts: ${message}`).catch(() => {});
      }
      if (current === stage) throw err;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[writer] chained stage ${current} failed, its own job will retry: ${message}`);
      // On the run itself too: a console line on a serverless host is gone by
      // the time anyone asks why a stage waited for its fallback job.
      const prior = Array.isArray(run.stage_outputs.warnings) ? (run.stage_outputs.warnings as unknown[]) : [];
      await saveScratch(run, "warnings", [...prior.slice(-9), { at: new Date().toISOString(), stage: current, message: message.slice(0, 500) }]).catch(() => {});
      return;
    }
    // Continue only when THIS worker advanced the run. A lost compare-and-set
    // means another worker owns it; a stage that ended the run (failed,
    // held, done) or re-ran itself in place is finished with this handler.
    if (run.lastAdvance !== "won" || run.status !== "running" || run.stage === "done" || run.stage === current) return;
    if (Date.now() + ESTIMATE_MS[run.stage] > deadline) return; // the queued job takes it from here
    run.lastAdvance = undefined;
  }
}
