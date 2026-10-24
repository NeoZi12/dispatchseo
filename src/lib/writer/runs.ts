import { db } from "@/lib/db";
import { enqueue } from "@/lib/jobs";
import { getProjectById } from "@/lib/projects";
import { writerStartGate } from "@/lib/autopilot/usage";

// The writer_runs table (migration 0064): starting, reading and advancing a
// run. The stages themselves live in stages.ts; this file only knows that a
// run has a current stage and a bag of outputs.
//
// THE INVARIANT THIS FILE DEFENDS: a run with status 'running' always has a
// pending `write` job behind it. Every path that could break that - a save
// that fails, an enqueue that fails, a stage that gives up, a handler the
// platform kills - is either made to throw (so the queue retries) or ends the
// run. A run that is 'running' with no job is invisible to everything and
// holds its idea's lock forever; that is the one state nothing may create.
// One deliberate exception: a run PARKED on the subscription writer (the
// agent provider, writer/agent-tasks.ts) has no job until its last task is
// answered; stage_outputs.waiting_on_agent marks it, and the autopilot
// health pass fails it as infra after 24 hours, so it cannot wait forever.

export const STAGES = ["pick", "research", "plan", "write", "verify", "done"] as const;
export type Stage = (typeof STAGES)[number];
export type RunStatus = "running" | "done" | "failed";

export type WriterRun = {
  id: string;
  project_id: string;
  suggestion_id: string | null;
  keyword: string | null;
  title_hint: string | null;
  stage: Stage;
  status: RunStatus;
  stage_outputs: Record<string, unknown>;
  rewrites: number;
  draft_id: string | null;
  error: string | null;
  cost_usd: number;
  created_at: string;
  updated_at: string;
  /** In-memory only: how this worker's last advanceRun ended. The chaining
   *  handler continues only after a win; a loss means another worker owns
   *  the run now. */
  lastAdvance?: "won" | "lost";
};

const RUN_COLS =
  "id, project_id, suggestion_id, keyword, title_hint, stage, status, stage_outputs, rewrites, draft_id, error, cost_usd, created_at, updated_at";

/** How many runs one site may have in flight, and how many it may start per
 *  UTC day. Plan-based cadence (the $15/$29/$59 tiers) lands in the next
 *  build step; until then these keep one tenant from spending the operator's
 *  model keys without limit. */
export const MAX_RUNNING_PER_PROJECT = Number(process.env.WRITER_MAX_RUNNING ?? 2);
export const MAX_STARTS_PER_DAY = Number(process.env.WRITER_DAILY_START_CAP ?? 3);

/**
 * Start a run and queue its first stage.
 *
 * Returns { run } on success; { refused } with a sentence when a cap says no,
 * when the idea is not this project's approved guide, or when a live run
 * already exists for it (the partial unique index says so - which is a
 * success of sorts: the article is already on its way).
 */
export async function startWriterRun(input: {
  projectId: string;
  suggestionId?: string | null;
  keyword?: string | null;
  titleHint?: string | null;
  /** The scheduler already ran the quota/spacing half of the gate; pause,
   *  plan and credentials are still enforced. */
  gated?: boolean;
}): Promise<{ run: WriterRun; refused?: undefined } | { run?: undefined; refused: string }> {
  // THE gate, for every caller (MCP write_article, the dashboard's Retry, the
  // autopilot scheduler): a paused site, a lapsed plan, no model keys, or a
  // hosted site past its weekly quota or spacing never starts a paid run.
  const project = await getProjectById(input.projectId);
  if (!project) return { refused: "No such project." };
  const gated = await writerStartGate(project, { gated: input.gated });
  if (gated) return { refused: gated };

  if (input.suggestionId) {
    // Ownership and state are checked here, not left to the foreign key: the
    // key accepts another tenant's idea, and the unique index would then
    // lock that tenant's idea until pick failed the run.
    const { data } = await db()
      .from("suggestions")
      .select("id, type, status")
      .eq("id", input.suggestionId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    const s = data as { type: string; status: string } | null;
    if (!s) return { refused: "No such idea on this project." };
    if (s.type !== "guide") return { refused: `That idea is a ${s.type}, and the writer only writes guides.` };
    if (s.status !== "approved") return { refused: `That idea is ${s.status}, not approved. Approve it first (update_suggestion).` };
  }

  const capped = await startCaps(input.projectId);
  if (capped) return { refused: capped };

  const { data, error } = await db()
    .from("writer_runs")
    .insert({
      project_id: input.projectId,
      suggestion_id: input.suggestionId ?? null,
      keyword: input.keyword?.trim() || null,
      title_hint: input.titleHint?.trim() || null,
    })
    .select(RUN_COLS)
    .maybeSingle();
  if (error) {
    if (isDuplicate(error)) return { refused: "An article for that idea is already being written. Read it with get_writer_runs." };
    throw new Error(`could not start the writer: ${error.message}`);
  }
  const run = data as WriterRun;
  try {
    await queueStage(run.project_id, run.id, "pick");
  } catch (e) {
    // No job = a run nothing will ever touch. End it rather than leave it.
    await failRun(run, `could not queue the first stage: ${e instanceof Error ? e.message : String(e)}`).catch(() => {});
    throw e;
  }
  return { run };
}

async function startCaps(projectId: string): Promise<string | null> {
  const startOfDay = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  const [{ count: running }, { count: today }] = await Promise.all([
    db().from("writer_runs").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("status", "running"),
    db().from("writer_runs").select("id", { count: "exact", head: true }).eq("project_id", projectId).gte("created_at", startOfDay),
  ]);
  if ((running ?? 0) >= MAX_RUNNING_PER_PROJECT) {
    return `This site already has ${MAX_RUNNING_PER_PROJECT} articles being written. Wait for one to finish (get_writer_runs).`;
  }
  if ((today ?? 0) >= MAX_STARTS_PER_DAY) {
    return `This site has started ${MAX_STARTS_PER_DAY} articles today, which is its daily limit; it resets at UTC midnight.`;
  }
  return null;
}

export async function getWriterRun(projectId: string, runId: string): Promise<WriterRun | null> {
  const { data } = await db()
    .from("writer_runs")
    .select(RUN_COLS)
    .eq("id", runId)
    .eq("project_id", projectId)
    .maybeSingle();
  return (data as WriterRun | null) ?? null;
}

export async function listWriterRuns(projectId: string, limit = 20): Promise<WriterRun[]> {
  const { data } = await db()
    .from("writer_runs")
    .select(RUN_COLS)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as WriterRun[] | null) ?? [];
}

/** Ideas that already have a live run, so pick never chooses one twice. */
export async function suggestionIdsInFlight(projectId: string): Promise<string[]> {
  const { data } = await db()
    .from("writer_runs")
    .select("suggestion_id")
    .eq("project_id", projectId)
    .eq("status", "running")
    .not("suggestion_id", "is", null);
  return ((data ?? []) as { suggestion_id: string }[]).map((r) => r.suggestion_id);
}

/** One `write` job per stage. The idempotency key carries the stage so a
 *  crashed stage re-queues itself without colliding with the job that is
 *  still marked in flight for the previous one. Queuing a job that already
 *  exists is a no-op, which is what lets the handler repair a run whose
 *  enqueue failed last time. */
export async function queueStage(projectId: string, runId: string, stage: Stage, runAfter?: Date): Promise<boolean> {
  const job = await enqueue({
    projectId,
    kind: "write",
    payload: { runId, stage },
    runAfter,
    idempotencyKey: `write:${runId}:${stage}`,
  });
  return job !== null;
}

/** Store something on the run WITHOUT moving it - a stage's scratch (the
 *  URLs research chose, so a retry does not buy the SERP again). */
export async function saveScratch(run: WriterRun, key: string, value: unknown): Promise<void> {
  const outputs = { ...run.stage_outputs, [key]: value };
  const { error } = await db()
    .from("writer_runs")
    .update({ stage_outputs: outputs, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .eq("stage", run.stage);
  if (error) throw new Error(`could not save ${key}: ${error.message}`);
  run.stage_outputs = outputs;
}

/** The draft id, written the moment the row exists and only if none is
 *  recorded yet, so a crash between insert and the final save can never
 *  insert (and publish) the article twice. */
export async function recordDraft(run: WriterRun, draftId: string): Promise<boolean> {
  const { data, error } = await db()
    .from("writer_runs")
    .update({ draft_id: draftId, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .is("draft_id", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not record the draft: ${error.message}`);
  if (!data) return false;
  run.draft_id = draftId;
  return true;
}

/**
 * Persist a stage's output and move the run on. `patch` lets a stage also set
 * the top-level columns it owns (keyword after pick, draft_id after handoff,
 * rewrites when looping back).
 *
 * COMPARE-AND-SET: the update only applies if the run is still at the stage
 * and rewrite count this handler started from. Two drains (Vercel's 5-minute
 * cron and GitHub's 10-minute one) plus a deadline release mean a retried
 * stage can run while the handler it replaced is still finishing; whichever
 * saves second must lose, or it overwrites the winner's outputs and queues a
 * stage twice. The loser returns quietly - the run has already moved on.
 */
export async function advanceRun(
  run: WriterRun,
  stageOutput: { key: string; value: unknown } | null,
  next: Stage,
  patch: Partial<Pick<WriterRun, "keyword" | "title_hint" | "suggestion_id" | "draft_id" | "rewrites" | "status">> = {},
  costUsd = 0,
  /** When the caller will run the next stage itself (the chaining handler),
   *  the queued job is only a fallback and must not fire while the chain is
   *  still working - a second drain would otherwise run the stage twice. */
  fallbackAfter?: Date,
): Promise<boolean> {
  const outputs = stageOutput ? { ...run.stage_outputs, [stageOutput.key]: stageOutput.value } : run.stage_outputs;
  const status: RunStatus = patch.status ?? (next === "done" ? "done" : run.status);
  const { data, error } = await db()
    .from("writer_runs")
    .update({
      stage: next,
      status,
      stage_outputs: outputs,
      cost_usd: Number((Number(run.cost_usd) + costUsd).toFixed(4)),
      error: null,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq("id", run.id)
    .eq("stage", run.stage)
    .eq("rewrites", run.rewrites)
    .eq("status", "running")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not save stage ${run.stage}: ${error.message}`);
  if (!data) {
    run.lastAdvance = "lost"; // someone else already moved this run on
    return false;
  }
  run.lastAdvance = "won";
  run.stage = next;
  run.status = status;
  run.stage_outputs = outputs;
  // The chaining handler reuses this object for the next stage: a stale
  // in-memory total made every later stage write (stale + own) and lose the
  // earlier increments (the first live run ledgered $0.43 and recorded $0.23).
  run.cost_usd = Number((Number(run.cost_usd) + costUsd).toFixed(4));
  // Every patched column, not only rewrites: pick resolves the keyword of a
  // run started from an idea and saves it here, and the chained research
  // stage read run.keyword from this same object (null -> "Cannot read
  // properties of null (reading 'toLowerCase')" on Paperbot's first run).
  for (const key of ["keyword", "title_hint", "suggestion_id", "draft_id", "rewrites"] as const) {
    if (patch[key] !== undefined) (run as Record<string, unknown>)[key] = patch[key];
  }
  if (status === "running" && next !== "done") await queueStage(run.project_id, run.id, next, fallbackAfter);
  return true;
}

/** Why a run ended without an article, for everything that counts runs:
 *  "infra" = a vendor or the platform failed (Anthropic/Jev/DataForSEO down,
 *  the platform DataForSEO budget or ceiling said no, a stage that kept
 *  throwing a VENDOR_FAILURE_RE error) - not the site's fault, so it never consumes the site's weekly

 *  quota or counts as a pipeline failure; "content" = this keyword cannot
 *  become an honest article (too few readable sources, no facts, no gain,
 *  still failing after the patches) - the idea is parked (stages.ts
 *  parkIdea), which is the system working, not breaking. */
export type FailureKind = "infra" | "content";

/** An error message that names a vendor or transport fault (429, 5xx, no
 *  key, no credit, no network) rather than something the model or the
 *  content did. One pattern for both readers: the verify stage's patch loop
 *  (hand the attempt back) and the write handler's last-attempt verdict
 *  (infra, or a failure that counts against the slot). */
export const VENDOR_FAILURE_RE =
  /(?:anthropic|typesafe) (?:401|403|429|5\d\d)|credit balance|overloaded|(?:ANTHROPIC|TYPESAFE)_API_KEY is not set|fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN|no time left/i;


/** A run that cannot continue. Terminal and deliberately NOT a thrown error:
 *  "nothing approved to write" or "no SERP provider" are states of the
 *  project, not faults in the queue, and must not burn five retries or page
 *  anyone. A fault (vendor down, bug) is thrown by the stage instead and the
 *  jobs queue retries it - and ends up here too once the retries run out
 *  (see job-handlers/write.ts), so the run never stays 'running' with no job.
 *  `kind` lands in stage_outputs.failure_kind (with any `extra` keys). */
export async function failRun(run: WriterRun, reason: string, costUsd = 0, kind?: FailureKind, extra: Record<string, unknown> = {}): Promise<void> {
  const outputs = kind || Object.keys(extra).length ? { ...run.stage_outputs, ...extra, ...(kind ? { failure_kind: kind } : {}) } : null;
  // Keyed on stage + rewrites like advanceRun: a worker holding a stale copy
  // (another worker advanced the run since) must not fail a run it no longer
  // owns, nor overwrite the newer stage_outputs with its old ones.
  const { data, error } = await db()
    .from("writer_runs")
    .update({
      status: "failed",
      error: reason.slice(0, 1000),
      cost_usd: Number((Number(run.cost_usd) + costUsd).toFixed(4)),
      updated_at: new Date().toISOString(),
      ...(outputs ? { stage_outputs: outputs } : {}),
    })
    .eq("id", run.id)
    .eq("stage", run.stage)
    .eq("rewrites", run.rewrites)
    .in("status", ["running"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`could not mark the run failed: ${error.message}`);
  if (!data) return;
  if (outputs) run.stage_outputs = outputs;
  run.status = "failed";
}


function isDuplicate(error: { code?: string; message: string }): boolean {
  return error.code === "23505" || /duplicate key value/i.test(error.message);
}
