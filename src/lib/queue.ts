// Server-side queue placement, shared by the dashboard actions and the MCP.
// Guides and tools are separate build queues (different builders, different
// cadence), so "front" is always relative to the row's own group. Never
// import this from a client component - it rides on the service-role client.

import { db } from "@/lib/db";
import { sortQueue } from "@/lib/metrics";

// Puts one suggestion at the front of its group's build queue by writing
// min(existing positions) - 1. Best-effort on purpose: before migration 0014
// the queue_position column is missing, both queries fail quietly, and the
// idea simply queues FIFO like it always did.
export async function placeAtFront(
  projectId: string,
  id: string,
  type: string,
): Promise<void> {
  const client = db();
  const isTool = type === "tool";
  const { data } = await client
    .from("suggestions")
    .select("id, type, queue_position")
    .eq("project_id", projectId)
    .eq("status", "approved");
  const positions = ((data ?? []) as { type: string; queue_position: number | null }[])
    .filter((s) => (s.type === "tool") === isTool && s.queue_position != null)
    .map((s) => s.queue_position as number);
  const front = positions.length ? Math.min(...positions) - 1 : 0;
  await client.from("suggestions").update({ queue_position: front }).eq("id", id);
}

// Persist an explicit build order for one queue (guides and tools are
// separate lists) by writing dense queue_position 1..n. Every id must be an
// approved suggestion of that group in this project; rows approved since the
// caller read the queue keep their place after the ordered set, in the sort
// order they already had. Shared by the dashboard's drag-reorder and the
// MCP's reorder_queue tool so both doors write identical positions.
export async function writeQueueOrder(
  projectId: string,
  group: "guide" | "tool",
  orderedIds: string[],
): Promise<{ ok: true } | { ok: false; message: string }> {
  const client = db();
  const { data: all, error } = await client
    .from("suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "approved");
  if (error) return { ok: false, message: error.message };

  const rows = (
    (all ?? []) as { id: string; type: string; created_at: string; queue_position?: number | null }[]
  ).filter((s) => (s.type === "tool") === (group === "tool"));
  const valid = new Set(rows.map((r) => r.id));

  const seen = new Set<string>();
  for (const id of orderedIds) {
    if (!valid.has(id) || seen.has(id)) {
      return { ok: false, message: "The queue changed underneath this reorder - re-read it and try again." };
    }
    seen.add(id);
  }
  const tail = sortQueue(rows.filter((r) => !seen.has(r.id))).map((r) => r.id);

  const results = await Promise.all(
    [...orderedIds, ...tail].map((id, idx) =>
      client.from("suggestions").update({ queue_position: idx + 1 }).eq("id", id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return {
      ok: false,
      message: failed.error.message.includes("queue_position")
        ? "Reordering needs migration 0014_manual_queue.sql - paste it into the Supabase SQL editor once."
        : failed.error.message,
    };
  }
  return { ok: true };
}
