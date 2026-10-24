import { db } from "./db";

// The background work queue (migration 0056).
//
// Three things in the new article flow are too slow for an HTTP request and
// too important to drop: crawling a customer's site, turning an accepted draft
// into finished HTML, and publishing it. Each becomes a row here, and a cron drains them.
//
// The claim mechanism is lifted from serp_tasks (0042/dataforseo-tasks.ts)
// rather than invented, because that pattern is already carrying real traffic
// in this codebase and its failure modes are understood:
//
//   finished_at IS NULL           = still to do
//   claimed_at set, finished NULL = in flight
//   claimed_at older than the grace window = the worker died; take it back
//
// The database row IS the lock. No queue service, no new dependency, and no
// second source of truth about what is pending - which matters because the
// dashboard, the alert rails and the drain route all have to agree on the
// answer to "is anything stuck".
//
// WHAT THIS FILE REFUSES TO DO: it never runs the work. Handlers live with
// their feature (crawl next to the crawler, publish next to the publisher) and
// register themselves with the drain route. A queue that knows what its jobs
// mean becomes the place every feature reaches into, and then nothing can be
// changed without changing it.

export type JobKind = "crawl" | "finish" | "publish" | "verify" | "write";

export type Job = {
  id: string;
  project_id: string;
  kind: JobKind;
  payload: Record<string, unknown>;
  run_after: string;
  claimed_at: string | null;
  finished_at: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
};

/** How long a claimed job may sit before another worker may take it. Long
 *  enough that a slow-but-alive worker is never double-run (the crawl is the
 *  longest job and is chunked well under this), short enough that a crashed
 *  worker does not strand an owner's article until someone notices. */
const CLAIM_GRACE_MINUTES = 20;

/** Give up after this many tries. A job that has failed five times is not
 *  going to succeed on the sixth; it needs a human to read its error, which
 *  is exactly what the dashboard surfaces it for. */
export const MAX_ATTEMPTS = 5;

/**
 * Add work. `idempotencyKey` is what makes a cron that fires twice, a webhook
 * that retries, and an owner who double-clicks all produce ONE job - the
 * partial unique index in 0056 enforces it while the job is pending, and frees
 * the key once it finishes so tomorrow's crawl is not blocked by yesterday's.
 *
 * Returns the job, or null when an identical one is already pending. Null is a
 * success, not a failure: it means the work is already going to happen.
 */
export async function enqueue(input: {
  projectId: string;
  kind: JobKind;
  payload?: Record<string, unknown>;
  runAfter?: Date;
  idempotencyKey?: string;
}): Promise<Job | null> {
  const row = {
    project_id: input.projectId,
    kind: input.kind,
    payload: input.payload ?? {},
    run_after: (input.runAfter ?? new Date()).toISOString(),
    idempotency_key: input.idempotencyKey ?? null,
  };
  const { data, error } = await db().from("jobs").insert(row).select("*").maybeSingle();
  if (error) {
    // 23505 = unique violation: the same work is already queued. Every other
    // error is real and must not be swallowed - a queue that silently drops
    // work is worse than one that is down, because nobody finds out.
    if (isDuplicate(error)) return null;
    throw new Error(`could not queue ${input.kind}: ${error.message}`);
  }
  return (data as Job) ?? null;
}

/**
 * Take up to `limit` due jobs and mark them in flight in one write each.
 *
 * The claim is a conditional UPDATE rather than a SELECT-then-UPDATE: two
 * workers racing on the same row means exactly one of them gets a row back,
 * because the second one's `claimed_at is null` predicate no longer matches.
 * That is the whole concurrency story, and it is why this needs no locking.
 */
export async function claimDue(limit = 5, kinds?: JobKind[]): Promise<Job[]> {
  const graceCutoff = new Date(Date.now() - CLAIM_GRACE_MINUTES * 60_000).toISOString();
  const now = new Date().toISOString();

  let query = db()
    .from("jobs")
    .select("*")
    .is("finished_at", null)
    .lte("run_after", now)
    .lt("attempts", MAX_ATTEMPTS)
    .order("run_after", { ascending: true })
    .limit(limit * 3); // over-fetch: some candidates lose the claim race below
  if (kinds?.length) query = query.in("kind", kinds);

  const { data, error } = await query;
  if (error) throw new Error(`could not read the work queue: ${error.message}`);

  const candidates = ((data as Job[]) ?? []).filter(
    (j) => !j.claimed_at || j.claimed_at < graceCutoff,
  );

  const claimed: Job[] = [];
  for (const candidate of candidates) {
    if (claimed.length >= limit) break;
    // Re-assert the exact state we read. If another worker claimed it in the
    // meantime, claimed_at no longer matches and this updates zero rows.
    let update = db()
      .from("jobs")
      .update({ claimed_at: now, attempts: candidate.attempts + 1 })
      .eq("id", candidate.id)
      .is("finished_at", null);
    update = candidate.claimed_at
      ? update.eq("claimed_at", candidate.claimed_at)
      : update.is("claimed_at", null);

    const { data: won } = await update.select("*").maybeSingle();
    if (won) claimed.push(won as Job);
  }
  return claimed;
}

/** Done. Terminal - the idempotency key becomes reusable. */
export async function complete(jobId: string): Promise<void> {
  await db()
    .from("jobs")
    .update({ finished_at: new Date().toISOString(), error: null })
    .eq("id", jobId);
}

/**
 * Failed. Backs off and lets the job be retried, unless it has run out of
 * attempts - in which case it is finished with its error preserved, because a
 * job that will never run again must stop looking pending to the alert rails.
 *
 * The error text is ALWAYS stored, even when the job will be retried. "This
 * failed for six hours and then worked" is the shape of a problem worth
 * seeing, and it is invisible if only terminal failures are recorded.
 */
export async function failJob(job: Job, message: string): Promise<void> {
  const exhausted = job.attempts >= MAX_ATTEMPTS;
  // Exponential-ish backoff on the wall clock: 2, 4, 8, 16 minutes. Long
  // enough that a rate-limited site is not hammered, short enough that a
  // transient blip does not delay an owner's article by an hour.
  const delayMinutes = Math.min(16, 2 ** Math.max(0, job.attempts));
  await db()
    .from("jobs")
    .update({
      error: message.slice(0, 500),
      // Persisted, not just read: the no-handler path burns a job's attempts
      // by passing an inflated copy in, and without writing the number back
      // that row would keep reading as attempt 1 - invisible to the health
      // query's exhausted filter. For an ordinary failure this rewrites the
      // value the claim already stored, which is a no-op.
      attempts: job.attempts,
      claimed_at: null,
      finished_at: exhausted ? new Date().toISOString() : null,
      run_after: exhausted
        ? job.run_after
        : new Date(Date.now() + delayMinutes * 60_000).toISOString(),
    })
    .eq("id", job.id);
}

/** What the dashboard and the alert rails need: is anything wedged? Counts
 *  only, deliberately - the moment this returns rows, a page starts rendering
 *  raw payloads at people.
 *
 *  `wedged` is the shape every other query is blind to: a job whose handler
 *  was KILLED by the platform (function timeout, OOM) rather than throwing, so
 *  failJob never ran - the row sits unfinished with attempts at the cap, which
 *  excludes it from claimDue AND from the `failed` count (that one requires
 *  finished_at). Nothing will ever touch it again, so it must be counted here
 *  or an owner's article silently never publishes. The drain route reports it
 *  on every tick. */
/** How far back a job that gave up still counts as news. A failure from last
 *  month is history - the article it belonged to has been dealt with or
 *  forgotten - and a count that can only ever grow makes a banner nobody
 *  reads, which is the one thing the alert rails cannot afford. */
const FAILED_WINDOW_DAYS = 7;

export async function queueHealth(projectId?: string): Promise<{
  pending: number;
  inFlight: number;
  failed: number;
  /** Which kinds gave up, so a caller can name what actually broke instead of
   *  calling a failed site scan an article. */
  failedKinds: JobKind[];
  wedged: number;
  oldestPendingMinutes: number | null;
}> {
  const base = () => {
    const q = db().from("jobs").select("id, run_after, claimed_at, attempts, finished_at");
    return projectId ? q.eq("project_id", projectId) : q;
  };
  const { data, error } = await base().is("finished_at", null).limit(500);
  if (error) {
    return { pending: 0, inFlight: 0, failed: 0, failedKinds: [], wedged: 0, oldestPendingMinutes: null };
  }

  const rows = (data as Pick<Job, "run_after" | "claimed_at" | "attempts">[]) ?? [];
  const graceCutoff = Date.now() - CLAIM_GRACE_MINUTES * 60_000;
  let pending = 0;
  let inFlight = 0;
  let wedged = 0;
  let oldest: number | null = null;
  for (const r of rows) {
    const claimedRecently = r.claimed_at ? Date.parse(r.claimed_at) > graceCutoff : false;
    if (r.attempts >= MAX_ATTEMPTS && !claimedRecently) {
      wedged++;
      continue;
    }
    if (claimedRecently) inFlight++;
    else pending++;
    const age = Date.now() - Date.parse(r.run_after);
    if (!claimedRecently && (oldest === null || age > oldest)) oldest = age;
  }

  // Exhausted jobs are finished rows, so they are counted separately - and
  // their kind is read rather than just counted, because "an article did not
  // go out" and "we could not read your site" are different sentences to the
  // owner, and only one of them is about an article.
  const since = new Date(Date.now() - FAILED_WINDOW_DAYS * 86_400_000).toISOString();
  const failedQuery = projectId
    ? db().from("jobs").select("kind").eq("project_id", projectId)
    : db().from("jobs").select("kind");
  const { data: failedRows } = await failedQuery
    .not("error", "is", null)
    .not("finished_at", "is", null)
    .gte("attempts", MAX_ATTEMPTS)
    .gte("created_at", since)
    .limit(100);
  const failedKinds = ((failedRows ?? []) as { kind: JobKind }[]).map((r) => r.kind);

  return {
    pending,
    inFlight,
    failed: failedKinds.length,
    failedKinds: [...new Set(failedKinds)],
    wedged,
    oldestPendingMinutes: oldest === null ? null : Math.round(oldest / 60_000),
  };
}

function isDuplicate(error: { code?: string; message: string }): boolean {
  return error.code === "23505" || /duplicate key value/i.test(error.message);
}
