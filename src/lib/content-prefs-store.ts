import { db } from "./db";
import type { Project } from "./projects";
import {
  normalizeContentPrefs,
  validateContentPrefs,
  type ContentPrefs,
} from "./content-prefs";

// Persistence for content-prefs.ts, kept apart so the pure module stays safe
// to import from client components (db.ts must never reach the browser).
// Shared by the dashboard server action and the set_content_prefs MCP tool -
// the parity rule's "logic lives in lib".
export async function saveContentPrefs(
  project: Project,
  raw: unknown,
): Promise<{ prefs: ContentPrefs | null; error: string | null }> {
  const prefs = normalizeContentPrefs(raw);
  const invalid = validateContentPrefs(prefs);
  if (invalid) return { prefs: null, error: invalid };
  // MERGE over the stored blob, never replace it: the same JSONB column also
  // carries raw keys this module does not model - the autopilot's
  // blocked_topics and profile_locked (src/lib/autopilot/controls.ts), the
  // writer's banned_claims / require_sources. Writing only the three modelled
  // knobs would silently wipe an owner's topic blocklist every time the
  // template editor saved.
  const error = await mergeContentPrefs(project.id, prefs as unknown as Record<string, unknown>);
  return { prefs, error };
}

/**
 * Merge keys into projects.content_prefs. Atomic through the
 * merge_content_prefs function (migration 0066: one `jsonb ||` update, so two
 * saves landing together cannot drop each other's keys); on a database
 * without it, falls back to a read-merge-write from a FRESH read taken right
 * before the write. Returns an error message, or null.
 */
export async function mergeContentPrefs(projectId: string, patch: Record<string, unknown>): Promise<string | null> {
  const { error: rpcError } = await db().rpc("merge_content_prefs", { p_project_id: projectId, p_patch: patch });
  if (!rpcError) return null;
  if (!/merge_content_prefs|function|schema cache|PGRST202/i.test(`${rpcError.code ?? ""} ${rpcError.message}`)) return rpcError.message;
  const { data, error } = await db().from("projects").select("content_prefs").eq("id", projectId).maybeSingle();
  if (error) return error.message;
  const raw = (data as { content_prefs: unknown } | null)?.content_prefs;
  const current = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const { error: writeError } = await db().from("projects").update({ content_prefs: { ...current, ...patch } }).eq("id", projectId);
  return writeError?.message ?? null;
}
