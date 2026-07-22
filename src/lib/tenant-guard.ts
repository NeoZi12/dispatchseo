import { db } from "./db";
import { isCloudMode } from "./cloud";
import { scopedProjects } from "./active-project";

// Cloud-mode ownership checks for mutations that take a raw row id. Being
// signed in is not enough once strangers share the deployment: the row the
// id points at must belong to a project the CALLER owns, or any customer
// could approve/build/delete another tenant's work by swapping ids
// (IDOR). Self-host has one owner, so every check is a no-op there.
//
// Throws the same generic "Not found" whether the row is missing or merely
// foreign - existence of other tenants' ids is not something to confirm.

export async function ownedProjectIds(): Promise<Set<string> | null> {
  if (!isCloudMode()) return null; // null = single-owner install, unrestricted
  const mine = await scopedProjects();
  return new Set(mine.map((p) => p.id));
}

export async function assertProjectOwned(projectId: string): Promise<void> {
  const owned = await ownedProjectIds();
  if (owned && !owned.has(projectId)) throw new Error("Not found");
}

export async function assertRowOwned(
  table: "suggestions" | "backlink_prospects" | "pages" | "trend_topics",
  id: string,
): Promise<void> {
  const owned = await ownedProjectIds();
  if (!owned) return;
  const { data, error } = await db().from(table).select("project_id").eq("id", id).maybeSingle();
  if (error || !data || !owned.has((data as { project_id: string }).project_id)) {
    throw new Error("Not found");
  }
}

// Bulk variant: every id must resolve AND be owned - a partially-foreign
// batch is rejected whole rather than silently filtered.
export async function assertRowsOwned(
  table: "suggestions" | "backlink_prospects" | "pages",
  ids: string[],
): Promise<void> {
  const owned = await ownedProjectIds();
  if (!owned || ids.length === 0) return;
  const { data, error } = await db().from(table).select("id, project_id").in("id", ids);
  if (error || !data || data.length !== new Set(ids).size) throw new Error("Not found");
  for (const row of data as Array<{ project_id: string }>) {
    if (!owned.has(row.project_id)) throw new Error("Not found");
  }
}
