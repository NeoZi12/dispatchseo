import { db } from "@/lib/db";

// Held articles release themselves (audit 2026-10-24, C3).
//
// WRITER_HOLD_FIRST holds a site's first hosted article for the OPERATOR's
// quality read; the publish caps can hold one too. Before this, a hold had
// no end but a human pressing "Publish now" - and the scheduler refuses to
// start anything while a run is held, so a customer whose first article
// nobody got round to reading had a paid plan that wrote nothing, forever.
// Now a hold is a window: 48 hours to read it, then it publishes itself.
//
// The hold time is writer_runs.updated_at. advanceRun stamps it when the run
// flips to 'held' (stage 'done'), and nothing writes a held run after that -
// saveScratch and advanceRun both require the stage to still match, and a
// done run has no stage left to advance. Called from the jobs drain (every
// ~10 minutes), so "within 48 hours" holds to the minute, not to the next
// daily pass.

export const HOLD_RELEASE_HOURS = 48;

export async function releaseStaleHolds(now = new Date()): Promise<{ released: string[]; failed: string[] }> {
  const cutoff = new Date(now.getTime() - HOLD_RELEASE_HOURS * 3_600_000).toISOString();
  const { data, error } = await db()
    .from("writer_runs")
    .select("id, project_id")
    .eq("status", "held")
    .lt("updated_at", cutoff)
    .order("updated_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`could not read held articles: ${error.message}`);
  const rows = (data ?? []) as { id: string; project_id: string }[];
  if (rows.length === 0) return { released: [], failed: [] };

  const [{ getWriterRun }, { releaseWriterRun }] = await Promise.all([import("@/lib/writer/runs"), import("@/lib/writer/stages")]);
  const released: string[] = [];
  const failed: string[] = [];
  for (const r of rows) {
    try {
      // Re-read through the project-scoped getter: the owner may have
      // released (or the run changed) between the list and now.
      const run = await getWriterRun(r.project_id, r.id);
      if (!run || run.status !== "held") continue;
      await releaseWriterRun(run);
      released.push(r.id);
    } catch (e) {
      failed.push(`${r.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { released, failed };
}

/** When a held run publishes itself, for the UI ("publishes itself on ..."). */
export function holdReleasesAt(heldAt: string | null | undefined): string | null {
  if (!heldAt) return null;
  const t = Date.parse(heldAt);
  return Number.isNaN(t) ? null : new Date(t + HOLD_RELEASE_HOURS * 3_600_000).toISOString();
}
