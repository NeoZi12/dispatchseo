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

// GitHub App installation ids are small sequential integers - trivially
// enumerable. Before binding one to a project, refuse any installation that
// is already attached to a DIFFERENT owner's project: without this, a
// signed-in attacker could claim another customer's installation and then
// commit files, write secrets, and dispatch workflows into the victim's
// repo through our App. (Residual: a never-yet-attached installation can't
// be bound to an owner this way - GitHub's setup redirect is unsigned and
// we hold no GitHub user identity - but the victim's own callback then
// fails loudly on this same check instead of silently sharing the repo.)
export async function assertInstallationClaimable(installationId: number): Promise<void> {
  const owned = await ownedProjectIds();
  if (!owned) return;
  const { data, error } = await db()
    .from("projects")
    .select("id")
    .eq("github_installation_id", installationId);
  if (error) throw new Error("Not found");
  for (const row of (data ?? []) as Array<{ id: string }>) {
    if (!owned.has(row.id)) throw new Error("Not found");
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
