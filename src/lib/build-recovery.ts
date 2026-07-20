import { db } from "./db";
import { reportCronRun } from "./cron-alerts";

// Stuck-build recovery (2026-07-20 audit, finding B3). A builder crash
// between update_suggestion(in_progress) and update_suggestion(done) -
// max-turns exhaustion, a cancelled run, an infra flake - used to strand the
// suggestion as a phantom "Building now" forever, with no dashboard action
// able to touch it and every future builder run skipping past it. This
// sweep, called from the hourly-gsc cron (the most frequent backend
// heartbeat), reverts anything stuck in_progress far past the build
// workflows' own 45-minute timeout back to approved, so the next scheduled
// builder attempt simply picks it up again. Recovery is an alert, not a
// silent fix: the owner should know a run died mid-build.

const STUCK_AFTER_HOURS = 3;

export async function recoverStuckBuilds(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STUCK_AFTER_HOURS * 3600_000).toISOString();
    // Two passes because started_at only exists since migration 0027 and is
    // null on rows marked in_progress before it: recent clock -> use it;
    // no clock -> fall back to decided_at with a wider (24h) margin.
    const dayCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data, error } = await db()
      .from("suggestions")
      .select("id, title, project_id, started_at, decided_at")
      .eq("status", "in_progress");
    if (error || !data?.length) return; // missing column/table or nothing stuck
    const stuck = data.filter((row) => {
      const started = row.started_at as string | null;
      if (started) return started < cutoff;
      const decided = row.decided_at as string | null;
      return !decided || decided < dayCutoff;
    });
    if (!stuck.length) return;
    for (const row of stuck) {
      const { error: revertError } = await db()
        .from("suggestions")
        .update({ status: "approved", started_at: null })
        .eq("id", row.id)
        .eq("status", "in_progress");
      if (revertError) {
        // Pre-0027 schema: retry without the clock column.
        await db()
          .from("suggestions")
          .update({ status: "approved" })
          .eq("id", row.id)
          .eq("status", "in_progress");
      }
    }
    await reportCronRun(
      "build-recovery",
      {
        recovered: stuck.map((s) => s.title),
        note: "a build died mid-run; the suggestion was re-queued and the next scheduled builder attempt will retry it",
      },
      true, // surfaces on the banner + email: a dead build should be known
    );
  } catch (e) {
    console.error("[build-recovery] sweep failed:", e);
  }
}
