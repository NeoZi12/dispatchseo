import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { getProjectById } from "@/lib/projects";
import { dispatchWriterTask } from "@/lib/github";
import { ledgerSubscriptionAnswer, maxOutputChars, parseJson, type Slot } from "./models";
import { failRun, getWriterRun, type Stage, type WriterRun } from "./runs";

// The hosted writer's agent provider, server side of the hand-off
// (operator-only, migration 0069). models.ts turns a generative call into a
// writer_tasks row and throws AwaitingAgent; this file is everything around
// that row:
//
//   park     the stage handler records stage_outputs.waiting_on_agent and
//            wakes the site repo's seo-writer-agent workflow
//   serve    get_writer_tasks hands the queued rows to that workflow's
//            Claude Code session (on the operator's subscription)
//   answer   submit_writer_task stores an answer, memoizes it on the run,
//            and when the run has nothing left queued re-queues its stage,
//            which replays and finds every answer waiting
//
// THE ONE EXCEPTION to runs.ts's invariant ("a running run always has a
// pending write job"): a run parked on the agent has no job behind it - the
// last answer creates one. What keeps it from waiting forever is the
// autopilot health pass (failStaleAgentRuns), which fails a run whose tasks
// went unanswered for 24 hours as infra, handing its slot back.

/** stage_outputs.waiting_on_agent while a stage is parked; null once the
 *  last answer re-queued it. `stage` scopes the marker: a marker left from
 *  an earlier stage never holds a later one back. */
export type WaitingOnAgent = { since: string; stage: Stage; keys: string[]; wake: string };

export function waitingOnAgent(run: Pick<WriterRun, "stage_outputs">): WaitingOnAgent | null {
  const w = run.stage_outputs.waiting_on_agent as WaitingOnAgent | null | undefined;
  return w && typeof w === "object" && typeof w.since === "string" ? w : null;
}

/**
 * Atomic two-level merge into writer_runs.stage_outputs (merge_run_output,
 * 0069): parallel submits for one run's pages cannot drop each other's
 * answers. On a database without the function, a read-merge-write from a
 * fresh read with the same two-level semantics.
 */
export async function mergeRunOutput(runId: string, patch: Record<string, unknown>): Promise<void> {
  const { error: rpcError } = await db().rpc("merge_run_output", { p_run_id: runId, p_patch: patch });
  if (!rpcError) return;
  if (!/merge_run_output|function|schema cache|PGRST202/i.test(`${rpcError.code ?? ""} ${rpcError.message}`)) {
    throw new Error(`could not update the run: ${rpcError.message}`);
  }
  const { data, error } = await db().from("writer_runs").select("stage_outputs").eq("id", runId).maybeSingle();
  if (error) throw new Error(`could not read the run: ${error.message}`);
  const current = ((data as { stage_outputs: Record<string, unknown> } | null)?.stage_outputs ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const old = current[k];
    merged[k] = isPlainObject(old) && isPlainObject(v) ? { ...old, ...v } : v;
  }
  const { error: writeError } = await db().from("writer_runs").update({ stage_outputs: merged, updated_at: new Date().toISOString() }).eq("id", runId);
  if (writeError) throw new Error(`could not update the run: ${writeError.message}`);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/**
 * The stage threw AwaitingAgent: record the wait and wake the workflow. The
 * run stays `running` at the same stage, no job attempt is spent, nothing is
 * queued behind it. Merged, not saved: the agent may already be answering
 * (the hourly poll can catch a task the moment it lands), and a full save of
 * this handler's copy of stage_outputs could erase an answer merged since.
 */
export async function parkOnAgent(run: WriterRun, stage: Stage, keys: string[]): Promise<WaitingOnAgent> {
  const project = await getProjectById(run.project_id);
  // A failed wake is logged, never fatal: the workflow's hourly schedule is
  // the fallback, and the wait itself is already safe in writer_tasks.
  const wake = project ? await dispatchWriterTask(project, run.id) : { dispatched: false as const, reason: "no-project" };
  if (!wake.dispatched) console.warn(`[writer] could not wake the subscription writer for run ${run.id}: ${wake.reason}; the hourly poll picks it up`);
  const waiting: WaitingOnAgent = { since: new Date().toISOString(), stage, keys: [...new Set(keys)], wake: wake.dispatched ? "dispatched" : wake.reason };
  // Every field is set, so the two-level merge replaces an older marker
  // field for field (keys included) rather than unioning the two.
  await mergeRunOutput(run.id, { waiting_on_agent: waiting });
  run.stage_outputs = { ...run.stage_outputs, waiting_on_agent: waiting };
  return waiting;
}

export type ServedTask = {
  task_id: string;
  slot: string;
  json: boolean;
  instructions: string;
  research: string | null;
  user_prompt: string;
  max_output_chars: number;
};

type TaskRow = {
  id: string;
  project_id: string;
  run_id: string;
  key: string;
  slot: Exclude<Slot, "judge">;
  instructions: string;
  research: string | null;
  user_prompt: string;
  json: boolean;
  status: string;
  attempts: number;
};

const TASK_COLS = "id, project_id, run_id, key, slot, instructions, research, user_prompt, json, status, attempts";

/** Queued tasks for this project, oldest first, only for runs still
 *  running. A task whose run has ended (failed, deleted) is closed here
 *  rather than served: answering it would be paid-for work nobody reads. */
export async function listAgentTasks(projectId: string, limit = 20): Promise<ServedTask[]> {
  const { data, error } = await db()
    .from("writer_tasks")
    .select(TASK_COLS)
    .eq("project_id", projectId)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(Math.min(20, Math.max(1, limit)));
  if (error) throw new Error(`could not read the writer tasks: ${error.message}`);
  const rows = (data ?? []) as TaskRow[];
  if (!rows.length) return [];
  const runIds = [...new Set(rows.map((r) => r.run_id))];
  const { data: runs } = await db().from("writer_runs").select("id, status").in("id", runIds);
  const live = new Set(((runs ?? []) as { id: string; status: string }[]).filter((r) => r.status === "running").map((r) => r.id));
  const dead = runIds.filter((id) => !live.has(id));
  if (dead.length) {
    await db().from("writer_tasks").update({ status: "failed", error: "the run ended before this task was answered" }).in("run_id", dead).eq("status", "queued");
  }
  return rows
    .filter((r) => live.has(r.run_id))
    .map((r) => ({
      task_id: r.id,
      slot: r.slot,
      json: r.json,
      instructions: r.instructions,
      research: r.research,
      user_prompt: r.user_prompt,
      max_output_chars: maxOutputChars(r.slot),
    }));
}

/** Stops serving a run's remaining tasks once the run has ended. */
export async function closeRunTasks(runId: string, why: string): Promise<void> {
  await db().from("writer_tasks").update({ status: "failed", error: why.slice(0, 500) }).eq("run_id", runId).eq("status", "queued");
}

export const JSON_RETRY_NOTE = "\n\nYour previous answer was not valid JSON. Reply with ONLY the JSON object, no prose, no code fence.";

/** Invalid-JSON answers a task may get before the run fails. */
const MAX_JSON_ATTEMPTS = 2;

export type SubmitOutcome =
  | { error: string }
  | { status: "requeued"; task_id: string; attempts: number; problem: string }
  | { status: "failed"; task_id: string; run_failed: true; reason: string }
  | { status: "done"; task_id: string; remaining: number; resumed: boolean };

/**
 * One answer. JSON tasks must parse (fence stripped first): the first bad
 * answer re-queues the task with a re-prompt, the second fails the run as
 * content - the stage would replay the same unusable answer forever. A good
 * answer is memoized on the run, ledgered at cost 0, and when nothing is
 * left queued for the run its stage is re-queued.
 */
export async function submitAgentTask(projectId: string, taskId: string, text: string): Promise<SubmitOutcome> {
  const { data } = await db().from("writer_tasks").select(TASK_COLS).eq("id", taskId).eq("project_id", projectId).maybeSingle();
  const task = data as TaskRow | null;
  if (!task || task.status !== "queued") return { error: "No queued writer task with that id on this project." };

  let answer = text;
  if (task.json) {
    answer = stripFence(text);
    if (parseJson(answer) === undefined) {
      const attempts = task.attempts + 1;
      const error = `answer ${attempts} was not valid JSON`;
      if (attempts < MAX_JSON_ATTEMPTS) {
        await db()
          .from("writer_tasks")
          .update({ attempts, error, user_prompt: task.user_prompt + JSON_RETRY_NOTE })
          .eq("id", task.id)
          .eq("status", "queued");
        return { status: "requeued", task_id: task.id, attempts, problem: "Not valid JSON. The task is queued again with a re-prompt: fetch it and answer with the JSON object only." };
      }
      await db().from("writer_tasks").update({ attempts, error, status: "failed" }).eq("id", task.id);
      const reason = `the subscription writer returned no valid JSON for ${task.slot}`;
      const run = await getWriterRun(projectId, task.run_id);
      if (run) await failRun(run, reason, 0, "content");
      await closeRunTasks(task.run_id, "the run failed");
      return { status: "failed", task_id: task.id, run_failed: true, reason };
    }
  }

  // Memo first, row second: if the memo write fails the task stays queued
  // and the agent's retry lands it; the reverse order could mark a task done
  // whose answer the stage can never find.
  await mergeRunOutput(task.run_id, { agent_answers: { [task.key]: answer } });
  const { data: marked } = await db()
    .from("writer_tasks")
    .update({ status: "done", answer, error: null, answered_at: new Date().toISOString() })
    .eq("id", task.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!marked) return { error: "That task was answered or closed meanwhile." };
  await ledgerSubscriptionAnswer(projectId, task.run_id, task.slot, answer.length);

  const { count } = await db().from("writer_tasks").select("id", { count: "exact", head: true }).eq("run_id", task.run_id).eq("status", "queued");
  const remaining = count ?? 0;
  const resumed = remaining === 0 ? await resumeRun(projectId, task.run_id) : false;
  return { status: "done", task_id: task.id, remaining, resumed };
}

/**
 * Re-queue a parked run's stage. The key carries a resume counter because
 * jobs.idempotency_key is unique only among PENDING jobs (0056's partial
 * index): the run's original `write:<run>:<stage>` job may still be in
 * flight, and two submits racing to be last must collide on the SAME key so
 * only one resume job exists - the counter is read before either bumps it.
 * The job carries resume: true, which lets it past the parked-run guard in
 * job-handlers/write.ts.
 */
async function resumeRun(projectId: string, runId: string): Promise<boolean> {
  const run = await getWriterRun(projectId, runId);
  if (!run || run.status !== "running" || run.stage === "done") return false;
  const n = Number(run.stage_outputs.agent_resumes ?? 0);
  await enqueue({
    projectId,
    kind: "write",
    payload: { runId, stage: run.stage, resume: true },
    idempotencyKey: `write:${runId}:${run.stage}:resume:${n}`,
  });
  await mergeRunOutput(runId, { waiting_on_agent: null, agent_resumes: n + 1 });
  return true;
}

/** Runs parked on the agent for longer than this are failed as infra. */
export const AGENT_STALE_HOURS = 24;
export const AGENT_STALE_REASON = "the subscription writer did not answer within 24h";

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
}
