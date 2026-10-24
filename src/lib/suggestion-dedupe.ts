import { db } from "./db";

// One keyword, one queued idea.
//
// Both insert paths into `suggestions` (the MCP propose_suggestion tool and
// the dashboard's Add idea form) used to insert unconditionally, and the only
// dedupe that existed lived in the AGENT INSTRUCTIONS ("pull the existing
// queue with get_suggestions first"). That is advice, not a guarantee: a
// research run that skipped a status - get_suggestions returns one status per
// call - re-proposed a keyword that was already approved, the owner approved
// the second copy from Home, and the queue showed the same guide twice
// (2026-07-29, "claude code hooks" on dispatchseo). Two builders would then
// write two guides for one keyword and compete with each other in the SERP.
//
// So the rule moves into code, where every caller gets it. Migration 0043 adds
// the matching partial unique index as the race-proof backstop; this module is
// what turns that into a readable answer instead of a 500.

// "parked" (the writer gave up on it: unreadable page one, no facts, still
// failing after patches) stays active for dedupe so research never re-adds the
// same idea under a fresh row.
export const ACTIVE_SUGGESTION_STATUSES = ["pending", "approved", "in_progress", "parked"] as const;

export type DuplicateHit = { id: string; title: string; status: string };

// Keywords are owner/agent-typed prose: "Claude Code Hooks" and
// "claude code  hooks" are the same target.
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

// The active queue for one project is tens of rows, so this reads them and
// compares in JS rather than pushing a normalized comparison through
// PostgREST - no ilike wildcard escaping to get wrong, and the same
// normalization runs here and in the index predicate's spirit.
export async function findDuplicateSuggestion(
  projectId: string,
  type: string,
  keyword: string | null | undefined,
): Promise<{ active: DuplicateHit | null; shipped: DuplicateHit | null }> {
  const wanted = keyword ? normalizeKeyword(keyword) : "";
  if (!wanted) return { active: null, shipped: null };

  const { data, error } = await db()
    .from("suggestions")
    .select("id, title, status, type, primary_keyword")
    .eq("project_id", projectId)
    .eq("type", type)
    .in("status", [...ACTIVE_SUGGESTION_STATUSES, "done"]);
  // A read failure must not block a proposal - the unique index still guards
  // the queue, and a silently-dropped idea is worse than a rare duplicate.
  if (error || !data) return { active: null, shipped: null };

  const rows = data as Array<DuplicateHit & { primary_keyword: string | null }>;
  const matches = rows.filter(
    (r) => r.primary_keyword && normalizeKeyword(r.primary_keyword) === wanted,
  );
  const hit = (r: DuplicateHit): DuplicateHit => ({ id: r.id, title: r.title, status: r.status });
  return {
    active: matches.find((r) => r.status !== "done") ? hit(matches.find((r) => r.status !== "done")!) : null,
    shipped: matches.find((r) => r.status === "done") ? hit(matches.find((r) => r.status === "done")!) : null,
  };
}

// Postgres unique_violation. The index (0043) is the backstop for the race the
// read-then-insert check above cannot close; catching its code turns that race
// into the same friendly "already queued" answer instead of a raw 500.
export function isDuplicateKeyError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key value/i.test(error.message ?? "");
}

export function duplicateNote(existing: DuplicateHit): string {
  return existing.status === "done"
    ? `Already covered: "${existing.title}" shipped for this keyword. Pick a different angle or update the published guide instead.`
    : `Already in the queue as "${existing.title}" (${existing.status}) - nothing added, so the same keyword can't get built twice.`;
}
