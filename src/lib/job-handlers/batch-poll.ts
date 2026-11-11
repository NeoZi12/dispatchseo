import { db } from "@/lib/db";
import { enqueue, type Job } from "@/lib/jobs";
import { batchResult, batchStatus } from "@/lib/writer/models";
import { closeRunTasks, failBatchTask, resumeIfSettled, settleTask, TASK_COLS, type TaskRow } from "@/lib/writer/agent-tasks";
import { failRun, getWriterRun } from "@/lib/writer/runs";

// The batch lane's waker (0075, operator-only). A batch-lane stage submits
// each generative call as a one-request Message Batch and parks; nothing on
// Anthropic's side calls us back, so this job polls. One chain per park:
// parkOnAgent enqueues `batch-poll:<run>`, and each pass that still finds a
// batch processing queues the next pass for the following jobs tick. An
// ended batch's result settles its task through settleTask (the same path
// as a subscription answer), and the last one to settle re-queues the stage.
//
// payload.runId puts this job in the run's lane (jobs.ts laneOf), so a poll
// never runs beside the stage job it is about to resume.

/** Jobs tick every 5 minutes; due a little before the next one. */
const POLL_EVERY_MS = 4 * 60_000;
/** Anthropic expires an unfinished batch at 24h (the result then reads
 *  "expired" and the stage retries). Two more hours of grace covers a slow
 *  expiry; past that the API is not answering us and the run ends as infra. */
const GIVE_UP_MS = 26 * 3_600_000;
/** A task row claimed but never given a batch id: its handler died between
 *  the claim and the submit. Failed without spending an attempt, so the
 *  replay submits it. */
const UNSUBMITTED_GRACE_MS = 15 * 60_000;

type BatchTask = TaskRow & { batch_id: string | null; batch_model: string | null; created_at: string };

export async function runBatchPollJob(job: Job): Promise<void> {
  const runId = String(job.payload.runId ?? "");
  if (!runId) throw new Error("batch-poll job is missing its run");
  const since = typeof job.payload.since === "string" ? job.payload.since : job.created_at;
  const run = await getWriterRun(job.project_id, runId);
  // An ended run already had its batches cancelled by closeRunTasks.
  if (!run || run.status !== "running") return;

  const { data, error } = await db()
    .from("writer_tasks")
    .select(`${TASK_COLS}, batch_id, batch_model, created_at`)
    .eq("run_id", runId)
    .eq("status", "queued");
  if (error) throw new Error(`could not read the run's batch tasks (is migration 0075 applied?): ${error.message}`);
  const tasks = (data ?? []) as BatchTask[];
  if (!tasks.length) {
    // All settled. Normally the last settle queued the resume job and
    // cleared the marker. A run STILL parked on this stage here means that
    // settle marked its task done and then died before the resume (a
    // database error in the ledger write, a killed handler): nothing else
    // would ever wake it, and it held its idea and one of the site's two
    // running slots for good. Queue the resume now (same idempotency key as
    // the one a slow settle would use, so there is never a second).
    const parked = run.stage_outputs.waiting_on_batch as { stage?: string } | null | undefined;
    if (parked && parked.stage === run.stage) await resumeIfSettled(job.project_id, runId);
    return;
  }

  let pending = false;
  for (const task of tasks) {
    if (!task.batch_id) {
      if (Date.now() - Date.parse(task.created_at) > UNSUBMITTED_GRACE_MS) await failBatchTask(task, "the batch was never submitted", { spent: false });
      else pending = true;
      continue;
    }
    try {
      const status = await batchStatus(task.batch_id);
      if (status.status !== "ended") {
        pending = true;
        continue;
      }
      const outcome = await batchResult(task.batch_id, task.key);
      if (!outcome.ok) {
        // Errored, expired or canceled: never billed. Retried once (the
        // replay resubmits), then the run fails as infra.
        await failBatchTask(task, outcome.error, { spent: true, kind: "infra" });
      } else if (outcome.truncated) {
        // Billed, and deterministic enough that it is the content, not the
        // vendor: the retry goes to the slot's next model (Opus for the
        // writer); a second truncation ends the run without the infra pass.
        await failBatchTask(task, "output was truncated at the token limit", { spent: true, billed: { usage: outcome.usage, model: task.batch_model } });
      } else {
        await settleTask(task, outcome.text, { lane: "batch", usage: outcome.usage, model: task.batch_model });
      }
    } catch (err) {
      // A failed read is not a failed request: keep polling. Throwing would
      // spend this job's attempts and, at five, leave the run parked with no
      // poller; the 26h limit above is what ends a run the API never answers.
      console.warn(`[writer] batch poll for run ${runId}, batch ${task.batch_id}: ${err instanceof Error ? err.message : String(err)}`);
      pending = true;
    }
  }

  if (!pending) return;
  // Checked after the reads, so a result that landed at the last minute
  // still settles instead of being thrown away with the run.
  if (Date.now() - Date.parse(since) > GIVE_UP_MS) {
    // A fresh copy: settles earlier in this pass merged answers into the run.
    const fresh = await getWriterRun(job.project_id, runId);
    if (fresh?.status === "running") await failRun(fresh, "the batch writer got no result within 26h", 0, "infra");
    await closeRunTasks(runId, "no batch result within 26h");
    return;
  }
  const n = Number(job.payload.n ?? 0) + 1;
  await enqueue({
    projectId: job.project_id,
    kind: "batch-poll",
    payload: { runId, since, n },
    runAfter: new Date(Date.now() + POLL_EVERY_MS),
    idempotencyKey: `batch-poll:${runId}:${since}:${n}`,
  });
}
