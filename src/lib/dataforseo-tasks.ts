// The SERP task queue - how scheduled rank tracking buys its data since the
// 2026-07-27 cost cut. DataForSEO's standard queue bills FLAT by requested
// depth at post time ($0.0006 per 10 results; live-measured), so a depth-30
// check is $0.0018 deterministic, vs the live endpoint's $0.004-0.02 that
// varies with how many pages Google happens to return. Results arrive
// minutes later, which a cron never notices: daily-ranks POSTs tasks through
// queueDailyRankTasks and the serp-collect cron picks the finished ones up
// with collectSerpResults. In-flight tasks live in serp_tasks (migration
// 0042). Interactive calls (the check_serp MCP tool) stay on the live
// endpoint - an agent mid-conversation cannot wait five minutes.
//
// Cadence model (per project, DataForSEO mode):
//   - Monday: a full SWEEP - one advanced depth-100 task (+ AI Overview) per
//     tracked keyword. Ground truth for everything: deep ranks, drop-outs,
//     AI-visibility snapshots.
//   - Other days: depth-30 RANK tasks only for keywords recently seen in the
//     top 30 (the ones whose daily movement anyone watches), plus depth-100
//     CONFIRM tasks for keywords never checked before (first-day discovery).
//   - A rank task that loses the domain from the top 30 does NOT write a
//     misleading "dropped out" row - the collector posts a same-day depth-100
//     confirm task instead, so a slip from 28 to 32 records as 32, exactly
//     like the old always-depth-100 behavior.
//   - The pacing governor (dataforseo-usage.ts) thins this: "slowed" halves
//     the daily rank tasks (alternating keywords by day), "weekly" drops
//     everything but the Monday sweep.

import { db } from "./db";
import {
  DATAFORSEO_BASE,
  authHeader,
  bestPositionForDomain,
  mapOrganicItems,
  parseAiOverview,
  type DataforseoCreds,
  type SerpItem,
} from "./dataforseo";
import { platformGlobalCeiling, recordDataforseoUsage, type PacingLevel } from "./dataforseo-usage";
import { buildGoogleAiSnapshot, recordAiSnapshots, type AiSnapshotInput } from "./ai-visibility";
import type { Project } from "./projects";

export const RANK_TASK_DEPTH = 30;
export const SWEEP_TASK_DEPTH = 100;

// Most keywords a single platform-billed weekly sweep will pay for. Set well
// above any honest usage - the largest real project tracks a few dozen - so a
// customer never meets it; it exists to bound the runaway case, not to price
// the plan. Never applied to BYO DataForSEO accounts. See the block in
// queueDailyRankTasks for why this is the only ceiling on that path.
// 2000 -> 500 on 2026-10-08: at $0.0066 per sweep task, 2000 keywords was
// $13/week per project - more than a Starter plan's whole monthly budget
// every Monday, and a trial could reach it by pasting a keyword list. 500 is
// ~5x the largest real project after five months (109 keywords) and, with
// the dormant-keyword decay below, costs at most ~$1/week.
export const SWEEP_MAX_PLATFORM = 500;
const TASK_POST_PATH = "/serp/google/organic/task_post";
// A standard-queue task normally completes in minutes. One that is still
// missing after a day is gone (DataForSEO refunds failed tasks); mark it so
// the collector stops waiting and the run report shows it.
const ABANDON_AFTER_MS = 24 * 3600 * 1000;
// task_post accepts up to 100 tasks per request.
const POST_CHUNK = 100;

export type TaskPurpose = "rank" | "sweep" | "confirm";

export type TaskSpec = {
  keywordId: string;
  keyword: string;
  purpose: TaskPurpose;
  depth: number;
  // Only sweep tasks load the AI Overview (and are fetched via task_get/
  // advanced) - it is what replaces the old per-keyword daily serpAiOverview
  // call.
  aio: boolean;
};

type PendingRow = {
  id: string;
  keyword_id: string | null;
  keyword: string;
  purpose: TaskPurpose;
  depth: number;
  posted_at: string;
};

async function dataforseoJson<T>(
  method: "GET" | "POST",
  path: string,
  creds: DataforseoCreds,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${DATAFORSEO_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(creds),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO ${path} HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = (await res.json()) as T & { status_code: number; status_message: string };
  if (json.status_code !== 20000) {
    throw new Error(`DataForSEO ${path} error ${json.status_code}: ${json.status_message}`);
  }
  return json;
}

type TaskPostResponse = {
  status_code: number;
  cost: number;
  tasks?: Array<{
    id?: string;
    status_code: number;
    status_message: string;
    data?: { keyword?: string };
  }>;
};

// POST a batch of SERP tasks and record them in serp_tasks. Post-level task
// failures (bad request, exhausted balance) come back per task; they are
// returned as failures rather than thrown so one bad keyword never blocks the
// rest of the batch.
export async function postSerpTasks(
  project: Project,
  creds: DataforseoCreds,
  specs: TaskSpec[],
): Promise<{ posted: number; failed: string[] }> {
  let posted = 0;
  const failed: string[] = [];
  for (let i = 0; i < specs.length; i += POST_CHUNK) {
    const chunk = specs.slice(i, i + POST_CHUNK);
    const body = chunk.map((s) => ({
      keyword: s.keyword,
      location_code: project.location_code,
      language_code: project.language_code,
      depth: s.depth,
      priority: 1, // normal queue - the cheap lane
      ...(s.aio ? { load_async_ai_overview: true } : {}),
    }));
    const json = await dataforseoJson<TaskPostResponse>("POST", TASK_POST_PATH, creds, body);
    // The whole chunk's cost is billed at post time; meter it against the
    // owner's monthly budget exactly like dataforseo.ts's postOnce hook does
    // for live calls. Fire-and-forget: a ledger failure must never fail the
    // run it's recording.
    if (creds.billedTo === "platform" && creds.meterProjectId && json.cost > 0) {
      recordDataforseoUsage(creds.meterProjectId, TASK_POST_PATH, json.cost).catch(console.error);
    }
    const rows: Array<Record<string, unknown>> = [];
    json.tasks?.forEach((t, idx) => {
      const spec = chunk[idx];
      if (t.status_code === 20100 && t.id) {
        rows.push({
          id: t.id,
          project_id: project.id,
          keyword_id: spec.keywordId,
          keyword: spec.keyword,
          purpose: spec.purpose,
          depth: spec.depth,
        });
      } else {
        failed.push(`"${spec.keyword}": task_post ${t.status_code} ${t.status_message}`);
      }
    });
    if (rows.length > 0) {
      const { error } = await db().from("serp_tasks").insert(rows);
      if (error) {
        // The tasks are already paid for and queued; without ledger rows the
        // collector will never fetch them. That is data loss, not a skip.
        throw new Error(`serp_tasks insert failed: ${error.message}`);
      }
      posted += rows.length;
    }
  }
  return { posted, failed };
}

// The daily-ranks entry point: decide what today's tasks are for this project
// and post them. `tracked` is the project's tracking keyword set; `pacing`
// only ever differs from "normal" for platform-billed projects.
export async function queueDailyRankTasks(
  project: Project,
  creds: DataforseoCreds,
  tracked: Array<{ id: string; keyword: string }>,
  pacing: PacingLevel,
): Promise<Record<string, unknown>> {
  const isSweepDay = new Date().getUTCDay() === 1; // Mondays, like the other weeklies

  // Keywords with a task already in flight (posted, not yet collected, not
  // yet abandoned) are skipped everywhere below - sweep included: if the
  // collector lags, the next run must not pay a second time for the same
  // check.
  const { data: inFlightRows } = await db()
    .from("serp_tasks")
    .select("keyword_id")
    .eq("project_id", project.id)
    .is("collected_at", null)
    .gte("posted_at", new Date(Date.now() - ABANDON_AFTER_MS).toISOString())
    .range(0, 1999);
  const inFlight = new Set(
    ((inFlightRows ?? []) as Array<{ keyword_id: string | null }>)
      .map((r) => r.keyword_id)
      .filter(Boolean) as string[],
  );
  const eligible = tracked.filter((kw) => !inFlight.has(kw.id));
  const inFlightSkipped = tracked.length - eligible.length;

  // The one hard ceiling on platform-billed rank spend.
  //
  // daily-ranks resolves its credentials with the monthly budget gate BYPASSED
  // (see the comment at its call site) because tracking should degrade, not
  // stop - the pacing governor thins the cadence to this Monday sweep and
  // leaves it running. That was bounded while plans capped tracked keywords at
  // 100/300/1000. Those caps were removed on 2026-08-02, which left the
  // terminal pacing level posting one paid task per tracked keyword with no
  // ceiling at all: cost scaled linearly with a number the customer controls,
  // on an account we bill a flat monthly fee.
  //
  // So the sweep keeps the OLDEST N (daily-ranks orders by created_at) and
  // drops the rest. Oldest wins because those keywords own the rank history
  // the dashboard charts; a newly added keyword losing its first check is
  // recoverable, a year-old series going full of holes is not. BYO accounts
  // are untouched - they spend their own money at whatever scale they like.
  const capped =
    creds.billedTo === "platform" && eligible.length > SWEEP_MAX_PLATFORM
      ? eligible.slice(0, SWEEP_MAX_PLATFORM)
      : eligible;
  const sweepDropped = eligible.length - capped.length;

  // Account-wide backstop (dataforseo-usage.ts): the per-owner budget gate is
  // bypassed here on purpose, but the platform's own ceiling is not - if the
  // shared account is being drained, tracking pauses too, with a named
  // reason, rather than being the one spender that never stops.
  if (creds.billedTo === "platform") {
    const ceiling = await platformGlobalCeiling();
    if (!ceiling.allowed) {
      return { mode: "queued", queued: 0, skipped: `pacing: ${ceiling.reason}` };
    }
  }

  if (isSweepDay) {
    // Ground truth day: every keyword, full depth, with the AI Overview.
    // Runs at every pacing level - it IS the reduced cadence.
    //
    // Dormant-keyword decay (2026-10-08): a keyword that has been checked in
    // the last five weeks and NEVER placed in the top 100 is swept every
    // FOURTH Monday instead of every one. Measured the day this shipped, 232
    // of the 400 keywords in the weekly sweep had not ranked anywhere in 28
    // days - ~60% of the sweep bought a weekly "still nowhere" for $0.0066
    // each. Rank movement into the top 100 from nothing happens on a
    // monthly scale (a new page needs indexing + weeks), so a monthly recheck
    // loses nothing the dashboard could chart. The rest week is spread by
    // keyword id so each Monday carries a quarter of the dormant set, and a
    // keyword with no check in the window at all (new, or one whose sweeps
    // failed) is always swept - the decay only ever applies to a keyword we
    // have positively observed as absent. Five-week window: a keyword resting
    // three Mondays was last checked 28 days ago, which must still count as
    // "observed", or it would flip back to weekly on every fourth sweep.
    const dormantSince = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString();
    const { data: history, error: historyError } = await db()
      .from("rank_checks")
      .select("keyword_id, position")
      .eq("project_id", project.id)
      .gte("checked_at", dormantSince)
      .order("checked_at", { ascending: false })
      .range(0, 19999);
    if (historyError) throw new Error(historyError.message);
    const observed = new Set<string>();
    const ranked = new Set<string>();
    for (const r of (history ?? []) as Array<{ keyword_id: string; position: number | null }>) {
      observed.add(r.keyword_id);
      if (r.position != null) ranked.add(r.keyword_id);
    }
    const weekSlot = Math.floor(Date.now() / (7 * 24 * 3600 * 1000)) % 4;
    const sweeping: typeof capped = [];
    let dormantResting = 0;
    for (const kw of capped) {
      const dormant = observed.has(kw.id) && !ranked.has(kw.id);
      if (dormant && parseInt(kw.id.slice(-2), 16) % 4 !== weekSlot) {
        dormantResting++;
        continue;
      }
      sweeping.push(kw);
    }

    const { posted, failed } = await postSerpTasks(
      project,
      creds,
      sweeping.map((kw) => ({
        keywordId: kw.id,
        keyword: kw.keyword,
        purpose: "sweep" as const,
        depth: SWEEP_TASK_DEPTH,
        aio: true,
      })),
    );
    return {
      mode: "queued",
      sweep: true,
      queued: posted,
      ...(dormantResting > 0 ? { dormant_resting: dormantResting } : {}),
      ...(inFlightSkipped > 0 ? { in_flight_skipped: inFlightSkipped } : {}),
      ...(sweepDropped > 0 ? { over_platform_cap: sweepDropped } : {}),
      failed,
    };
  }

  if (pacing === "weekly") {
    return {
      mode: "queued",
      queued: 0,
      skipped: "pacing: monthly DataForSEO budget nearly spent - weekly sweep only until it resets",
    };
  }

  // Latest known state per keyword, from the last 8 days of checks. The
  // Monday sweep touches every keyword, so 8 days covers the full set; a
  // keyword with no row in the window is genuinely new (or its sweep failed)
  // and gets a full-depth discovery check today. Newest-first ordering means
  // a truncated read (PostgREST row cap on huge projects) loses only the
  // OLDEST rows - worst case a keyword is misread as new and gets one extra
  // depth-100 check, never silently dropped.
  const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await db()
    .from("rank_checks")
    .select("keyword_id, position, checked_at")
    .eq("project_id", project.id)
    .gte("checked_at", since)
    .order("checked_at", { ascending: false })
    .range(0, 9999);
  if (error) throw new Error(error.message);
  const latest = new Map<string, number | null>();
  for (const r of (data ?? []) as Array<{ keyword_id: string; position: number | null }>) {
    if (!latest.has(r.keyword_id)) latest.set(r.keyword_id, r.position);
  }

  const specs: TaskSpec[] = [];
  let restingCount = 0;
  const dayParity = new Date().getUTCDate() % 2;
  for (const kw of capped) {
    if (!latest.has(kw.id)) {
      // Never checked: full-depth discovery today ("confirm" = full-depth
      // regular task whose result is always recorded, found or not).
      specs.push({
        keywordId: kw.id,
        keyword: kw.keyword,
        purpose: "confirm",
        depth: SWEEP_TASK_DEPTH,
        aio: false,
      });
      continue;
    }
    const pos = latest.get(kw.id);
    if (pos != null && pos <= RANK_TASK_DEPTH) {
      // "slowed" pacing: alternate keywords across days by uuid parity, so
      // every keyword still gets checked every other day.
      if (pacing === "slowed" && parseInt(kw.id.slice(-1), 16) % 2 !== dayParity) {
        restingCount++;
        continue;
      }
      specs.push({
        keywordId: kw.id,
        keyword: kw.keyword,
        purpose: "rank",
        depth: RANK_TASK_DEPTH,
        aio: false,
      });
    } else {
      // Ranked beyond 30 (or not at all): daily movement there is noise;
      // the Monday sweep covers it.
      restingCount++;
    }
  }

  if (specs.length === 0) {
    return {
      mode: "queued",
      queued: 0,
      resting: restingCount,
      ...(inFlightSkipped > 0 ? { in_flight_skipped: inFlightSkipped } : {}),
      failed: [],
    };
  }
  const { posted, failed } = await postSerpTasks(project, creds, specs);
  return {
    mode: "queued",
    queued: posted,
    resting: restingCount,
    ...(inFlightSkipped > 0 ? { in_flight_skipped: inFlightSkipped } : {}),
    ...(sweepDropped > 0 ? { over_platform_cap: sweepDropped } : {}),
    ...(pacing === "slowed" ? { pacing: "slowed" } : {}),
    failed,
  };
}

// Cleanup for projects the collector cannot resolve creds for (plan gate
// after a downgrade, decrypt failure, platform env gone): their in-flight
// tasks would otherwise sit pending forever with no error and no report.
// Marks everything older than the abandon window; returns how many, so the
// cron report shows the loss instead of hiding it.
export async function abandonStalePending(projectId: string): Promise<number> {
  const cutoff = new Date(Date.now() - ABANDON_AFTER_MS).toISOString();
  const { data, error } = await db()
    .from("serp_tasks")
    .update({
      collected_at: new Date().toISOString(),
      error: "abandoned: no DataForSEO creds to collect with (plan/budget/decrypt)",
    })
    .eq("project_id", projectId)
    .is("collected_at", null)
    .lt("posted_at", cutoff)
    .select("id");
  if (error) throw new Error(`serp_tasks abandon failed: ${error.message}`);
  return (data ?? []).length;
}

type TasksReadyResponse = {
  status_code: number;
  tasks?: Array<{
    result?: Array<{ id?: string }> | null;
  }>;
};

type TaskGetResponse = {
  status_code: number;
  tasks?: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result?: Array<{ items?: SerpItem[] }> | null;
  }>;
};

// The serp-collect cron's per-project pass: fetch finished tasks, write
// rank_checks + AI-visibility rows, mark the ledger. Returns counts for the
// cron report; `errored` carries per-task messages so a broken account shows
// WHICH keywords failed.
export async function collectSerpResults(
  project: Project,
  creds: DataforseoCreds,
): Promise<Record<string, unknown>> {
  const { data, error } = await db()
    .from("serp_tasks")
    .select("id, keyword_id, keyword, purpose, depth, posted_at")
    .eq("project_id", project.id)
    .is("collected_at", null)
    .order("posted_at", { ascending: true })
    .range(0, 999);
  if (error) throw new Error(error.message);
  const pending = (data ?? []) as PendingRow[];
  if (pending.length === 0) return { collected: 0 };

  // One free call lists every finished-but-unretrieved task on the account
  // (shared across projects on the platform account - the intersection with
  // OUR pending ids scopes it).
  const ready = await dataforseoJson<TasksReadyResponse>(
    "GET",
    "/serp/google/organic/tasks_ready",
    creds,
  );
  const readyIds = new Set(
    (ready.tasks ?? []).flatMap((t) => (t.result ?? []).map((r) => r.id)).filter(Boolean) as string[],
  );

  const now = Date.now();
  const rankRows: Array<Record<string, unknown>> = [];
  const aiRows: AiSnapshotInput[] = [];
  const confirms: TaskSpec[] = [];
  const errored: string[] = [];
  const collectedIds: Array<{ id: string; error?: string }> = [];
  let abandoned = 0;

  // Guard against confirm loops: at most one same-day confirm per keyword,
  // and a confirm task's own miss is a real "not in top 100" - never another
  // confirm.
  const todayStart = new Date().toISOString().slice(0, 10);
  const { data: todaysConfirms } = await db()
    .from("serp_tasks")
    .select("keyword_id")
    .eq("project_id", project.id)
    .eq("purpose", "confirm")
    .gte("posted_at", todayStart);
  const confirmedToday = new Set(
    ((todaysConfirms ?? []) as Array<{ keyword_id: string | null }>)
      .map((r) => r.keyword_id)
      .filter(Boolean) as string[],
  );

  for (const task of pending) {
    if (!readyIds.has(task.id)) {
      if (now - Date.parse(task.posted_at) > ABANDON_AFTER_MS) {
        collectedIds.push({ id: task.id, error: "abandoned: never completed in the queue" });
        abandoned++;
      }
      continue;
    }
    // Sweeps carry the AI Overview, which only the advanced task_get returns.
    const endpoint =
      task.purpose === "sweep"
        ? `/serp/google/organic/task_get/advanced/${task.id}`
        : `/serp/google/organic/task_get/regular/${task.id}`;
    let got: TaskGetResponse;
    try {
      got = await dataforseoJson<TaskGetResponse>("GET", endpoint, creds);
    } catch (e) {
      // A transient fetch failure leaves the task pending for the next run -
      // it stays in tasks_ready until retrieved.
      errored.push(`"${task.keyword}": ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const t = got.tasks?.[0];
    if (!t || t.status_code >= 40000) {
      collectedIds.push({
        id: task.id,
        error: `task ${t?.status_code ?? "?"}: ${t?.status_message ?? "no task in response"}`,
      });
      errored.push(`"${task.keyword}": task ${t?.status_code} ${t?.status_message}`);
      continue;
    }
    const items = t.result?.[0]?.items ?? [];
    const best = bestPositionForDomain(mapOrganicItems(items), project.domain);
    if (task.purpose === "rank" && !best) {
      // Lost from the top 30 - don't record a misleading drop-out; recheck at
      // full depth today so a slip to #32 records as 32, not as "gone".
      if (task.keyword_id && !confirmedToday.has(task.keyword_id)) {
        confirmedToday.add(task.keyword_id);
        confirms.push({
          keywordId: task.keyword_id,
          keyword: task.keyword,
          purpose: "confirm",
          depth: SWEEP_TASK_DEPTH,
          aio: false,
        });
      }
    } else if (task.keyword_id) {
      rankRows.push({
        keyword_id: task.keyword_id,
        project_id: project.id,
        position: best?.position ?? null,
        url: best?.url ?? null,
      });
    }
    if (task.purpose === "sweep") {
      aiRows.push(buildGoogleAiSnapshot(task.keyword, project.domain, parseAiOverview(items)));
    }
    collectedIds.push({ id: task.id });
  }

  if (rankRows.length > 0) {
    const { error: insErr } = await db().from("rank_checks").insert(rankRows);
    if (insErr) throw new Error(`rank_checks insert failed: ${insErr.message}`);
  }
  let aiVisibility: Record<string, unknown> = { snapshots: 0 };
  if (aiRows.length > 0) {
    const rec = await recordAiSnapshots(project.id, aiRows);
    aiVisibility =
      "error" in rec
        ? { error: rec.error }
        : { snapshots: rec.inserted, cited: aiRows.filter((r) => r.cited).length };
  }
  let confirmsPosted = 0;
  if (confirms.length > 0) {
    const posted = await postSerpTasks(project, creds, confirms);
    confirmsPosted = posted.posted;
    errored.push(...posted.failed);
  }
  // Mark everything we resolved this pass. Two updates (clean vs errored)
  // keep it to a fixed number of queries instead of one per task.
  const cleanIds = collectedIds.filter((c) => !c.error).map((c) => c.id);
  if (cleanIds.length > 0) {
    const { error: updErr } = await db()
      .from("serp_tasks")
      .update({ collected_at: new Date().toISOString() })
      .in("id", cleanIds);
    if (updErr) throw new Error(`serp_tasks update failed: ${updErr.message}`);
  }
  for (const c of collectedIds.filter((c) => c.error)) {
    await db()
      .from("serp_tasks")
      .update({ collected_at: new Date().toISOString(), error: c.error })
      .eq("id", c.id);
  }

  return {
    collected: cleanIds.length,
    ranks_written: rankRows.length,
    ai: aiVisibility,
    confirms_posted: confirmsPosted,
    still_pending: pending.length - collectedIds.length,
    ...(abandoned > 0 ? { abandoned } : {}),
    ...(errored.length > 0 ? { errored } : {}),
  };
}
