// Trend radar triggers, shared by the dashboard actions and the MCP - the
// two doors must run the SAME cooldown and dispatch logic so "Scan now" from
// Claude Code behaves exactly like the dashboard button. Never import this
// from a client component - it rides on the service-role client.

import { db } from "@/lib/db";
import { dispatchTrendExpand, dispatchTrendScan } from "@/lib/github";
import type { Project } from "@/lib/projects";

// Both trend triggers share a cooldown: each CI run costs Actions minutes and
// a slice of the Claude subscription, so a double-click or an impatient
// re-fire must not burn a second run. The workflow-side concurrency group
// stops parallel runs; this stops queued back-to-back ones.
export const TREND_COOLDOWN_MIN = 30;

function withinTrendCooldown(iso: string | null | undefined): boolean {
  return Boolean(iso) && Date.now() - new Date(iso as string).getTime() < TREND_COOLDOWN_MIN * 60000;
}

// "Scan now": wakes the project repo's trend-scan workflow (stage 1 -
// trending subjects only). The scan runs in the repo's CI and reports back
// through the MCP - subjects appear on the radar a few minutes later.
export async function requestTrendScan(
  project: Project,
): Promise<{ ok: boolean; message: string }> {
  // Cooldown reads both stamps: requested_at catches a scan still running
  // (last_trend_scan_at only lands when record_trend_scan fires at the end).
  // Selected separately from the project row so a pre-0016 schema just skips
  // this half of the check instead of breaking every project query.
  const { data: stamp } = await db()
    .from("projects")
    .select("trend_scan_requested_at")
    .eq("id", project.id)
    .maybeSingle();
  const requestedAt = (stamp as { trend_scan_requested_at?: string | null } | null)
    ?.trend_scan_requested_at;
  if (withinTrendCooldown(requestedAt) || withinTrendCooldown(project.last_trend_scan_at)) {
    return {
      ok: false,
      message: `A scan already ran in the last ${TREND_COOLDOWN_MIN} minutes - the radar is current.`,
    };
  }
  const result = await dispatchTrendScan(project);
  if (result.ok) {
    // Stamp fire-and-forget: on a pre-0016 schema the column is missing and
    // the cooldown simply leans on last_trend_scan_at alone.
    await db()
      .from("projects")
      .update({ trend_scan_requested_at: new Date().toISOString() })
      .eq("id", project.id);
  }
  return result;
}

// "Get takes" on a radar subject: wakes the trend-expand workflow for that
// ONE topic. The card flips to "working on takes"; the run's suggestions
// land under it linked by trend_topic_id.
export async function requestTrendExpand(
  project: Project,
  topicId: string,
): Promise<{ ok: boolean; message: string }> {
  const { data: topic, error } = await db()
    .from("trend_topics")
    .select("id, title, status, expand_requested_at")
    .eq("id", topicId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!topic) return { ok: false, message: "Unknown subject - re-scan and try again." };
  if (topic.status === "dismissed") {
    return {
      ok: false,
      message: "This subject was dismissed - a new scan can resurface it if it's still hot.",
    };
  }
  if (withinTrendCooldown(topic.expand_requested_at)) {
    return {
      ok: false,
      message: "Ideas were already requested for this subject - they land here when the run finishes.",
    };
  }
  const result = await dispatchTrendExpand(project, topic.id, topic.title);
  if (result.ok) {
    await db()
      .from("trend_topics")
      .update({ status: "expanding", expand_requested_at: new Date().toISOString() })
      .eq("id", topic.id);
  }
  return result;
}
