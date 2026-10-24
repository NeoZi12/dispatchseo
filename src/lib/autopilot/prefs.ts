import type { Project } from "@/lib/projects";

// The autopilot's raw keys inside projects.content_prefs. They live in the
// same JSONB blob as the template knobs content-prefs.ts models, but are read
// here, raw, the way the writer already reads banned_claims: the template
// editor's normalizer must not be taught about them, and saveContentPrefs
// merges over the blob so it never drops them.
//
//   blocked_topics  string[] (max 50) - research and the writer refuse any
//                   keyword that falls under one (math.ts matchesBlockedTopic)
//   profile_locked  true once the owner edited the brand text; the model
//                   never rewrites site_profile after that (profile.ts)

export function rawPrefs(project: Pick<Project, "content_prefs">): Record<string, unknown> {
  const p = project.content_prefs;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

export function blockedTopicsOf(project: Pick<Project, "content_prefs">): string[] {
  const v = rawPrefs(project).blocked_topics;
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
}
