import { db } from "@/lib/db";
import { ownerUserIdForProject, primeProjectHint, projectPlan, type ProjectHint, type ProjectPlan } from "@/lib/billing";
import { suggestionIdsInFlight } from "@/lib/writer/runs";
import type { Project } from "@/lib/projects";
import { monthStartUtc, nextMonthStartUtc, upcomingStarts, weekStartUtc, type CadenceInput } from "./math";
import { monthUsage, weekUsage } from "./usage";
import { rampInputs, rampSinceDay, rampVerdict } from "./ramp";
import { sortIdeas } from "./idea-order";

// The hosted writer's queue, as the owner sees it on /queue and the agent
// reads it in get_autopilot (`upcoming`, `parked`): every idea the scheduler
// will write, in the order it will write them, with the day each is
// expected to start.
//
// The set and the order are the writer's pick stage (writer/stages.ts), to
// the letter: type "guide", status "approved", not already taken by a
// running writer_run, in idea-order.ts sortIdeas order - any explicit
// reorder_queue position first, then the best volume for its difficulty
// (since 2026-11-10; oldest-first before that).
//
// The dates are math.ts upcomingStarts over the same weekUsage the
// scheduler's cadence() reads, floored at next_article_at: the scheduler's
// slot claim refuses any day before it (a plan change applies from the date
// already set, scheduler.ts claimSlot), and held to the site's monthly share
// of the owner's pool the way the month gate holds the scheduler (usage.ts
// monthAllowance): a date past this month's share moves into next month.
// A projection, not a promise: setup gaps, a spent keyword budget, the
// owner's other sites using the pool first, or an idea the writer sets aside
// all move the real day, and a pause or a plan with no articles means no
// dates.

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
  /** The internal weekly pace (the ramp's quota of the site's monthly
   *  number). Not the plan's promise - monthShare is. */
  usedThisWeek: number;
  quota: number;
  /** This site's articles this month (its share of the owner's pool) and
   *  how many it has used; both null where the month gate does not apply
   *  (free plan's own ledger, self-host, unbilled, the operator's
   *  override), usedThisMonth also when the month could not be read. */
  monthShare: number | null;
  usedThisMonth: number | null;
  paused: boolean;
};

type Row = {
  id: string;
  title: string;
  primary_keyword: string | null;
  keyword_volume: number | null;
  keyword_difficulty: number | null;
  rationale?: string | null;
  queue_position?: number | null;
  created_at?: string | null;
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

export async function getHostedQueue(
  project: Pick<Project, "id" | "next_article_at" | "writer_paused_at"> & Partial<Omit<ProjectHint, "id">>,
  now = new Date(),
  // Home draws its calendar and "Up next" from this and never shows the
  // parked list, so it skips that read.
  opts: { parked?: boolean } = {},
): Promise<HostedQueue> {
  // Whatever of the row the caller holds spares the plan and usage reads
  // below their own single-row lookups (billing.ts projectHint).
  primeProjectHint(project);
  const cols = "id, title, primary_keyword, keyword_volume, keyword_difficulty, queue_position, created_at";
  // The month's room hangs off the plan (only a pooled plan has one), so it
  // starts the moment the plan is known, beside the reads below.
  const planRead = projectPlan(project.id);
  const monthRead = planRead.then((p) => monthRoom(project, p, now));
  const [approvedRes, parkedRes, busy, plan, usage, ramp, month] = await Promise.all([
    db()
      .from("suggestions")
      .select(cols)
      .eq("project_id", project.id)
      .eq("type", "guide")
      .eq("status", "approved")
      .limit(QUEUE_LIMIT),
    opts.parked === false
      ? Promise.resolve({ data: [] as Row[], error: null })
      : db()
          .from("suggestions")
          .select(`${cols}, rationale`)
          .eq("project_id", project.id)
          .eq("type", "guide")
          .eq("status", "parked")
          .order("created_at", { ascending: false })
          .limit(PARKED_LIMIT),
    suggestionIdsInFlight(project.id),
    planRead,
    weekUsage(project.id, now),
    // The ramp's reads need no plan, only its verdict does: started here,
    // beside the plan read, instead of after it.
    rampInputs(project.id, rampSinceDay(now)),
    monthRead,
  ]);
  if (approvedRes.error) throw new Error(`could not read the queue: ${approvedRes.error.message}`);

  const taken = new Set(busy);
  const queued = sortIdeas(((approvedRes.data ?? []) as Row[]).filter((r) => !taken.has(r.id)));

  const paused = Boolean(project.writer_paused_at);
  // The projection uses the same ceiling the scheduler will (ramp.ts; a
  // paid pool runs at its full pace unless the index brake paused it).
  const quota = rampVerdict(ramp, plan, now).quota;
  let starts: Date[] = [];
  if (!paused && quota > 0) {
    const floor = project.next_article_at ? new Date(project.next_article_at) : null;
    const from = floor && floor.getTime() > now.getTime() ? floor : now;
    // The week's count belongs to THIS week; a floor in a later week starts
    // that week's quota from zero.
    const sameWeek = weekStartUtc(from).getTime() === weekStartUtc(now).getTime();
    // The month's room belongs to THIS month the same way; a floor in a
    // later month starts with the whole share.
    const sameMonth = monthStartUtc(from).getTime() === monthStartUtc(now).getTime();
    starts = monthCappedStarts({
      now: from,
      quota,
      spacingDays: plan.spacingDays,
      countThisWeek: sameWeek ? usage.count : 0,
      lastStartedAt: usage.lastStartedAt,
      n: Math.max(queued.length, 1),
      share: month ? month.share : null,
      room: month ? (sameMonth ? month.room : month.share) : 0,
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
    monthShare: month ? month.share : null,
    usedThisMonth: month ? month.used : null,
    paused,
  };
}

/** What is left of this month for a site on a pooled plan: its share minus
 *  what it used, and never more than the owner's pool has left across
 *  their sites. The month gate's own counts (usage.ts monthUsage). Null
 *  where there is no month gate. Display-only: an unreadable month projects
 *  as a fresh one, still capped at the share (the gate itself refuses). */
async function monthRoom(
  project: Pick<Project, "id"> & { owner_user_id?: string | null },
  plan: Pick<ProjectPlan, "articlesPerMonth" | "poolPerMonth">,
  now: Date,
): Promise<{ share: number; room: number; used: number | null } | null> {
  const share = plan.articlesPerMonth;
  const pool = plan.poolPerMonth;
  if (share == null || pool == null) return null;
  const ownerId = project.owner_user_id ?? (await ownerUserIdForProject(project.id));
  if (!ownerId) return null;
  const m = await monthUsage(project.id, ownerId, now);
  if ("readError" in m) return { share, room: share, used: null };
  return { share, room: Math.max(0, Math.min(share - m.siteCount, pool - m.ownerCount)), used: m.siteCount };
}

/**
 * upcomingStarts held to the site's month (multi-site plans, 2026-11-11):
 * at most `room` starts in the first projected month and `share` in every
 * month after, the way the month gate holds the scheduler. Starts past a
 * month's allowance move to the next month's first open days - the 1st is a
 * candidate, since the 05:30 run comes after midnight - with the week's
 * count and the spacing carried across the month boundary. share null = no
 * monthly number: the week alone paces it, exactly as before. Pure.
 */
export function monthCappedStarts(input: CadenceInput & { n: number; share: number | null; room: number }): Date[] {
  const { share, room, ...week } = input;
  if (share == null) return upcomingStarts(week);
  if (share <= 0 || input.n <= 0) return [];
  const out: Date[] = [];
  let from = input.now;
  let allowance = Math.max(0, Math.min(room, share));
  let countThisWeek = input.countThisWeek;
  let lastStartedAt = input.lastStartedAt;
  // Two years of months is far past any queue: the guard only stops a
  // loop that could never fill (it can't while share > 0 and quota > 0).
  for (let guard = 0; out.length < input.n && guard < 24; guard++) {
    if (allowance > 0) {
      const monthEnd = nextMonthStartUtc(from).getTime();
      const batch = upcomingStarts({ ...week, now: from, countThisWeek, lastStartedAt, n: Math.min(allowance, input.n - out.length) });
      out.push(...batch.filter((d) => d.getTime() < monthEnd));
    }
    const next = nextMonthStartUtc(from);
    // upcomingStarts counts the week of its `now`: the 1st's ISO week may
    // have begun last month, so its count is the starts already projected
    // in it, plus the real ones when that week is the caller's own.
    const wk = weekStartUtc(next).getTime();
    countThisWeek =
      out.filter((d) => weekStartUtc(d).getTime() === wk).length + (wk === weekStartUtc(input.now).getTime() ? input.countThisWeek : 0);
    lastStartedAt = out.length ? out[out.length - 1].toISOString() : input.lastStartedAt;
    from = next;
    allowance = share;
  }
  return out;
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

/** Put a set-aside (parked) idea back in the queue, where its score puts
 *  it (idea-order.ts). The MCP
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
  // Back with no position, it takes its place by score like every other
  // unpositioned idea (idea-order.ts). Writing dense positions for the
  // whole queue here, as this did before 2026-11-10, would freeze the
  // queue and stop the score from ordering it.
  return true;
}
