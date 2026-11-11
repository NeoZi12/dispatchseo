// The order the hosted writer takes its queued ideas in: the best search
// volume for its difficulty first, so an owner's first articles go after the
// biggest keywords they can actually rank for (Neo, 2026-11-10).
//
// One function, read by every surface that shows or keeps that order: the
// pick stage (writer/stages.ts), the Queue page and get_autopilot
// (autopilot/queue.ts), the report's next titles (autopilot/report.ts) and
// the operator's customer page (owner-customer.ts). Change it here and they
// all move together, so no page ever promises an order the writer does not
// keep.
//
// Agent-mode queues (metrics.ts sortQueue: the Research page, get_suggestions,
// build briefs) keep their owner-dragged-then-oldest order on purpose: there
// the owner and their agent steer, and this ranking is the hosted writer's.
//
// Pure: no database, safe to import anywhere.

/** How hard KD pulls a keyword down: the score halves every KD_HALVING
 *  points (KD 20 = half the volume, KD 40 = a third, KD 60 = a quarter). */
export const KD_HALVING = 20;

/** The KD an idea without a measured one counts as: hard enough that a
 *  measured easy keyword always wins over a guessed one. */
export const KD_UNKNOWN = 50;

export type RankableIdea = {
  keyword_volume?: number | string | null;
  keyword_difficulty?: number | string | null;
  queue_position?: number | null;
  created_at?: string | null;
  /** "owner" = a topic the owner asked for by hand ("Write about this"). */
  source?: string | null;
};

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Monthly searches discounted for difficulty: volume / (1 + KD / 20).
 *  590 searches at KD 0 scores 590 and beats 720 at KD 9 (497); 1,300 at
 *  KD 0 beats both. An idea with no measured volume scores 0, under every
 *  measured one. */
export function ideaScore(i: RankableIdea): number {
  const volume = num(i.keyword_volume);
  if (volume == null || volume <= 0) return 0;
  const kd = Math.min(100, Math.max(0, num(i.keyword_difficulty) ?? KD_UNKNOWN));
  return volume / (1 + kd / KD_HALVING);
}

/** The pick order. An explicit queue_position still comes first: the
 *  hosted Queue page has no drag, so a position is the operator's or the
 *  agent's deliberate reorder_queue call, and that order is kept. Next, a
 *  topic the owner asked for by hand, oldest first: they typed it because
 *  they want it written, and by score alone it sank under every research
 *  idea (one DataForSEO cannot measure scores 0, and research keeps
 *  refilling the queue, so on a small plan it was never written at all).
 *  Everything else follows by score, best first; an equal score goes to the
 *  older idea. */
export function compareIdeas(a: RankableIdea, b: RankableIdea): number {
  const pa = a.queue_position ?? null;
  const pb = b.queue_position ?? null;
  if (pa != null && pb != null && pa !== pb) return pa - pb;
  if (pa != null && pb == null) return -1;
  if (pa == null && pb != null) return 1;
  const oa = a.source === "owner";
  const ob = b.source === "owner";
  if (oa !== ob) return oa ? -1 : 1;
  if (oa && ob) return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  const byScore = ideaScore(b) - ideaScore(a);
  if (byScore !== 0) return byScore;
  return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
}

export function sortIdeas<T extends RankableIdea>(rows: T[]): T[] {
  return [...rows].sort(compareIdeas);
}
