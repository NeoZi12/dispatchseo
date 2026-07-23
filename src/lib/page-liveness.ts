import { db } from "./db";
import { isProjectUrl } from "./url-guard";
import type { Project } from "./projects";

// Truthful "published" state (migration 0033). log_page records a page when
// its PR OPENS; it only counts as live once the URL has actually served 200.
// This module owns both halves: deciding what "live" means for a row, and
// lazily probing the pending ones. Shared by the Guides screen and the
// get_pages MCP tool so the dashboard and the agent read the same truth.

// A pages row as far as liveness cares. Columns optional because rows from a
// pre-0033 install come back without them.
export type LivenessRow = {
  id: string;
  url: string;
  live_at?: string | null;
  live_checked_at?: string | null;
};

// Pre-0033 rows (no column) read as live - that is exactly the old behavior.
// Post-0033 rows are live once verified.
export function isLive(row: LivenessRow): boolean {
  return !("live_at" in row) || row.live_at != null;
}

// Probe backoff: a pending page is re-checked at most this often, so a PR
// that sits unmerged for a day doesn't get hammered on every dashboard view.
const RECHECK_MS = 5 * 60_000;
// Never probe more than a handful per call - pending pages are normally 0-1.
const MAX_PROBES = 6;

// Verify pending pages in place: fetch each not-recently-checked pending URL
// and stamp live_at on the first 200. Mutates the passed rows so callers can
// render the fresh state without re-querying. Best-effort by design - a dead
// site, a WAF, or a pre-0033 schema must never break the page that called
// this. (Demoting a live page that starts 404ing is deliberately out of
// scope - see LATER.md.)
export async function refreshPageLiveness<T extends LivenessRow>(
  project: Project,
  rows: T[],
): Promise<void> {
  const now = Date.now();
  const pending = rows
    .filter((r) => "live_at" in r && r.live_at == null)
    .filter(
      (r) =>
        r.live_checked_at == null || now - Date.parse(r.live_checked_at) > RECHECK_MS,
    )
    // Same SSRF posture as check_sameness: never fetch a stored URL that
    // isn't on this project's own domain.
    .filter((r) => isProjectUrl(r.url, project.domain))
    .slice(0, MAX_PROBES);
  if (pending.length === 0) return;

  await Promise.all(
    pending.map(async (r) => {
      const checkedAt = new Date().toISOString();
      let liveAt: string | null = null;
      try {
        const res = await fetch(r.url, {
          redirect: "follow",
          signal: AbortSignal.timeout(6000),
          headers: { "user-agent": "DispatchSEO-liveness-check" },
        });
        if (res.ok) liveAt = checkedAt;
      } catch {
        // unreachable = still pending; the stamp below records the attempt
      }
      const patch = liveAt
        ? { live_at: liveAt, live_checked_at: checkedAt }
        : { live_checked_at: checkedAt };
      const { error } = await db().from("pages").update(patch).eq("id", r.id);
      // A pre-0033 schema rejects the columns - leave the row as it was.
      if (!error) Object.assign(r, patch);
    }),
  );
}
