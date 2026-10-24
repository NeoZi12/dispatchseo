import { db } from "@/lib/db";
import { MAX_ATTEMPTS, type Job } from "@/lib/jobs";
import { failRun, getWriterRun, queueStage, saveScratch, VENDOR_FAILURE_RE, type Stage, type WriterRun } from "@/lib/writer/runs";
import { parkIdea, runStage } from "@/lib/writer/stages";
import { isAgentTaskFailed, isAwaitingAgent } from "@/lib/writer/models";
import { closeRunTasks, parkOnAgent, waitingOnAgent } from "@/lib/writer/agent-tasks";


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
//
// The agent provider (operator-only, 0069) adds a fourth outcome besides
// advance / fail / retry: PARK. A stage that throws AwaitingAgent has queued
// tasks for the subscription writer; the run stays running at that stage,
// the job completes normally (no attempt spent, nothing queued for the next
// stage), and the chain stops. The last answer re-queues the stage as a
// `resume` job, which replays it with every answer memoized.

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
  const waiting = waitingOnAgent(run);
  if (job.payload.resume) {
    // Dropped in memory so the stage's own full saves erase it too, even if
    // a late park marker landed after the answer that queued this job.
    if (waiting) run.stage_outputs = { ...run.stage_outputs, waiting_on_agent: null };
  } else if (waiting && waiting.stage === run.stage) {
    // A parked run's fallback job (queued by the stage before it, for a
    // chain that then parked) or a duplicate: the stage would only queue the
    // same tasks again. The answers re-queue it as a resume job.
    return;
  }
  for (;;) {
    const current = run.stage;
    try {
      await runStage(run, deadline);
    } catch (err) {
      if (isAwaitingAgent(err)) {
        await parkOnAgent(run, current, err.keys);
        return;
      }
      if (isAgentTaskFailed(err)) {
        await failRun(run, err.message, 0, "content");
        await closeRunTasks(run.id, "the run failed");
        return;
      }
      // Only the job's OWN stage spends this job's attempts. A chained later
      // stage has its own pending job with all its attempts left, so its
      // failure must not end the run on this job's count.
      if (current === stage && job.attempts >= MAX_ATTEMPTS) {
        const message = err instanceof Error ? err.message : String(err);
        await endExhaustedRun(run, `gave up at stage ${run.stage} after ${job.attempts} attempts: ${message}`, message).catch(() => {});

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

/** Vendor-failed runs on one idea before the idea is parked. */
const INFRA_PARK_AFTER = 3;

/** Ends a run whose stage threw on every attempt. Only a vendor or
 *  transport fault is "infra": usage.ts skips infra runs and the scheduler
 *  hands their slot back, so a deterministic model-output failure ("planner
 *  returned no usable plan", "not enough time left") marked infra would
 *  retry the same idea every day forever at full model cost. Those get no
 *  kind and spend the slot. A vendor fault that keeps killing the SAME idea
 *  parks it after INFRA_PARK_AFTER runs, so even an infra loop has an end. */
async function endExhaustedRun(run: WriterRun, reason: string, message: string): Promise<void> {
  if (!VENDOR_FAILURE_RE.test(message)) return failRun(run, reason);
  if (run.suggestion_id) {
    const { count, error } = await db()
      .from("writer_runs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", run.project_id)
      .eq("suggestion_id", run.suggestion_id)
      .eq("stage_outputs->>failure_kind", "infra");
    // This run is not marked yet, hence the +1. A failed count falls through
    // to the plain infra failure: the next exhausted run counts again.
    if (!error && (count ?? 0) + 1 >= INFRA_PARK_AFTER) {
      return parkIdea(run, run.suggestion_id, `vendor failures on ${(count ?? 0) + 1} runs for this idea - ${reason}`, 0, {}, "infra");
    }
  }
  return failRun(run, reason, 0, "infra");
}
