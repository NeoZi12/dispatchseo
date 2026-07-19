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
  const { error } = await db()
    .from("projects")
    .update({ content_prefs: prefs })
    .eq("id", project.id);
  return { prefs, error: error?.message ?? null };
}
