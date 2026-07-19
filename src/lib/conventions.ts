import { db } from "./db";
import type { Project } from "./projects";

// The dashboard's mirror of a repo's .dispatchseo/conventions.md - the site
// facts the setup workflow discovers by inspecting the user's codebase. The
// agent writes the repo file for its own runs and calls set_conventions with
// the same facts so the dashboard can render them (theme swatches, voice
// chips, exemplar links). One row per project; null means setup hasn't run
// and the Instructions page shows the setup card instead. Same tolerance
// posture as site-profile.ts: a query error (e.g. migration 0012 not applied
// yet) degrades to null, never a crash.

export type ThemeToken = { name: string; value?: string };

export type ConventionsData = {
  product_summary?: string;
  stack?: string;
  package_manager?: string;
  build_command?: string;
  guides_dir?: string;
  tools_wiring?: string;
  theme_tokens?: ThemeToken[];
  fonts?: string[];
  voice_rules?: string[];
  exemplar_guides?: string[];
  exemplar_visuals?: string[];
  tool_reference?: string;
  analytics?: string;
  notes?: string;
};

export async function loadConventions(
  project: Project,
): Promise<{ data: ConventionsData; updatedAt: string } | null> {
  const { data, error } = await db()
    .from("conventions")
    .select("data, updated_at")
    .eq("project_id", project.id)
    .maybeSingle();
  if (error || !data) return null;
  return { data: data.data as ConventionsData, updatedAt: data.updated_at };
}

export async function saveConventions(
  project: Project,
  data: ConventionsData,
): Promise<{ error: string | null }> {
  const { error } = await db()
    .from("conventions")
    .upsert({ project_id: project.id, data, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
}
