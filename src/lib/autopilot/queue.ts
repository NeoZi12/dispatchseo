import { db } from "@/lib/db";
import { projectPlan } from "@/lib/billing";
import { writeQueueOrder } from "@/lib/queue";
import { suggestionIdsInFlight } from "@/lib/writer/runs";
import type { Project } from "@/lib/projects";
import { upcomingStarts, weekStartUtc } from "./math";
import { weekUsage } from "./usage";

// The hosted writer's queue, as the owner sees it on /queue and the agent
// reads it in get_autopilot (`upcoming`, `parked`): every idea the scheduler
// will write, in the order it will write them, with the day each is
// expected to start.
//
// The set and the order are the writer's pick stage (writer/stages.ts), to
// the letter: type "guide", status "approved", not already taken by a
// running writer_run, the owner's queue_position first (nulls last), then
// oldest created_at - the order the pick stage reads since 2026-10-24.
//
// The dates are math.ts upcomingStarts over the same weekUsage the
// scheduler's cadence() reads, floored at next_article_at: the scheduler's
// slot claim refuses any day before it (a plan change applies from the date
// already set, scheduler.ts claimSlot). A projection, not a promise: setup
// gaps, a spent keyword budget or an idea the writer sets aside all move
// the real day, and a pause or a plan with no articles means no dates.

export type QueuedIdea = {
  suggestion_id: string;
  title: string;
  keyword: string | null;
  volume: number | null;
  kd: number | null;
  /** yyyy-mm-dd (UTC) the article is expected to start; null when the
   *  writer is paused, the plan buys none, or it is past the projection. */
  expected_start: string | null;
};

export type ParkedIdea = {
  suggestion_id: string;
  title: string;
  keyword: string | null;
  volume: number | null;
  kd: number | null;
  /** Why the writer set it aside (parkIdea's "[writer did not build: ...]"). */
  reason: string | null;
};

export type HostedQueue = {
  upcoming: QueuedIdea[];
  parked: ParkedIdea[];
  /** The next article slot (yyyy-mm-dd), queue or not: when the queue is
   *  empty that morning's run researches first. */
  nextStart: string | null;
  usedThisWeek: number;
  quota: number;
  paused: boolean;
};

type Row = {
  id: string;
  title: string;
  primary_keyword: string | null;
  keyword_volume: number | null;
  keyword_difficulty: number | null;
  rationale?: string | null;
};

const QUEUE_LIMIT = 200;
const PARKED_LIMIT = 20;

/** The newest "[writer did not build: ...]" line: parkIdea and
 *  removeQueuedIdea both PREPEND theirs to the rationale, so the first line
 *  is always the latest reason, however many earlier ones sit under it. */
const PARK_LINE = /^\[writer did not build: ([^\]]+)\]\n?/;
export function parkReason(rationale: string | null | undefined): string | null {
  return (rationale ?? "").trimStart().match(PARK_LINE)?.[1] ?? null;
}

/** The rationale with every leading park line removed - what it said before
 *  the idea was set aside - or null when nothing else was there. The writer
 *  reads the rationale, so a restored idea must not carry "set it aside". */
export function stripParkReasons(rationale: string | null | undefined): string | null {
  let r = (rationale ?? "").trimStart();
  while (PARK_LINE.test(r)) r = r.replace(PARK_LINE, "").trimStart();
  return r.trim() || null;
}

export async function getHostedQueue(project: Pick<Project, "id" | "next_article_at" | "writer_paused_at">, now = new Date()): Promise<HostedQueue> {
  const cols = "id, title, primary_keyword, keyword_volume, keyword_difficulty";
  const [approvedRes, parkedRes, busy, plan, usage] = await Promise.all([
    db()
      .from("suggestions")
      .select(cols)
      .eq("project_id", project.id)
      .eq("type", "guide")
      .eq("status", "approved")
      .order("queue_position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(QUEUE_LIMIT),
    db()
      .from("suggestions")
      .select(`${cols}, rationale`)
      .eq("project_id", project.id)
      .eq("type", "guide")
      .eq("status", "parked")
      .order("created_at", { ascending: false })
      .limit(PARKED_LIMIT),
    suggestionIdsInFlight(project.id),
    projectPlan(project.id),
    weekUsage(project.id, now),
  ]);
  if (approvedRes.error) throw new Error(`could not read the queue: ${approvedRes.error.message}`);

  const taken = new Set(busy);
  const queued = ((approvedRes.data ?? []) as Row[]).filter((r) => !taken.has(r.id));

  const paused = Boolean(project.writer_paused_at);
  const quota = plan.articlesPerWeek;
  let starts: Date[] = [];
  if (!paused && quota > 0) {
    const floor = project.next_article_at ? new Date(project.next_article_at) : null;
    const from = floor && floor.getTime() > now.getTime() ? floor : now;
    // The week's count belongs to THIS week; a floor in a later week starts
    // that week's quota from zero.
    const sameWeek = weekStartUtc(from).getTime() === weekStartUtc(now).getTime();
    starts = upcomingStarts({
      now: from,
      quota,
      countThisWeek: sameWeek ? usage.count : 0,
      lastStartedAt: usage.lastStartedAt,
      n: Math.max(queued.length, 1),
    });
  }
  const day = (d: Date | undefined) => (d ? d.toISOString().slice(0, 10) : null);

  return {
    upcoming: queued.map((r, i) => ({
      suggestion_id: r.id,
      title: r.title,
      keyword: r.primary_keyword,
      volume: r.keyword_volume,
      kd: r.keyword_difficulty,
      expected_start: day(starts[i]),
    })),
    // A failed read hides the section; it never takes the queue down.
    parked: parkedRes.error
      ? []
      : ((parkedRes.data ?? []) as Row[]).map((r) => ({
          suggestion_id: r.id,
          title: r.title,
          keyword: r.primary_keyword,
          volume: r.keyword_volume,
          kd: r.keyword_difficulty,
          reason: parkReason(r.rationale),
        })),
    nextStart: day(starts[0]),
    usedThisWeek: usage.count,
    quota,
    paused,
  };
}

/** Takes one queued idea out of the queue, so the writer never picks it.
 *  "Set aside", not delete: the idea moves to the parked list with a reason
 *  the owner can read, and restoreQueuedIdea puts it back. Never rejected,
 *  which nothing on the hosted dashboard lists again. Only a guide still
 *  waiting in the queue: an idea a run already moved on is left alone. The
 *  MCP counterpart is update_suggestion with status "parked". */
export const SET_ASIDE_REASON = "[writer did not build: you set it aside]";
export async function removeQueuedIdea(projectId: string, suggestionId: string): Promise<boolean> {
  const { data: row, error: readError } = await db()
    .from("suggestions")
    .select("rationale")
    .eq("id", suggestionId)
    .eq("project_id", projectId)
    .eq("type", "guide")
    .eq("status", "approved")
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row) return false;
  // Prepended, the way parkIdea (writer/stages.ts) does it: the research
  // rationale under it survives, and restoreQueuedIdea strips the prefix.
  const prior = (row as { rationale: string | null }).rationale ?? "";
  const { data, error } = await db()
    .from("suggestions")
    .update({ status: "parked", rationale: `${SET_ASIDE_REASON}\n${prior}`.trim().slice(0, 4000), queue_position: null, decided_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("project_id", projectId)
    .eq("type", "guide")
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

/** Put a set-aside (parked) idea back in the queue, at the end. The MCP
 *  counterpart is update_suggestion with status "approved" on a parked
 *  guide. */
export async function restoreQueuedIdea(projectId: string, suggestionId: string): Promise<boolean> {
  const { data: row, error: readError } = await db()
    .from("suggestions")
    .select("rationale")
    .eq("id", suggestionId)
    .eq("project_id", projectId)
    .eq("type", "guide")
    .eq("status", "parked")
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!row) return false;
  const { data, error } = await db()
    .from("suggestions")
    .update({
      status: "approved",
      rationale: stripParkReasons((row as { rationale: string | null }).rationale),
      queue_position: null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .eq("project_id", projectId)
    .eq("type", "guide")
    .eq("status", "parked")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  // A null queue_position alone is not "the end": the pick order is
  // positions first, then created_at, so an old idea with no position would
  // jump ahead of every newer unpositioned one. Dense positions with this id
  // last make the end explicit. The status flip already happened, so a
  // failed reorder is a warning, not a failure.
  const { data: queued, error: queueError } = await db()
    .from("suggestions")
    .select("id")
    .eq("project_id", projectId)
    .eq("type", "guide")
    .eq("status", "approved")
    .neq("id", suggestionId)
    .order("queue_position", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (queueError) {
    console.warn(`[autopilot] restored idea ${suggestionId} but could not read the queue to place it last: ${queueError.message}`);
    return true;
  }
  const ids = ((queued ?? []) as { id: string }[]).map((r) => r.id);
  const order = await writeQueueOrder(projectId, "guide", [...ids, suggestionId]);
  if (!order.ok) console.warn(`[autopilot] restored idea ${suggestionId} but could not place it last: ${order.message}`);
  return true;
}
