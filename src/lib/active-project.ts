import { cookies } from "next/headers";
import {
  DEFAULT_PROJECT_ID,
  getProjectBySlug,
  listProjects,
  type Project,
} from "./projects";

export const PROJECT_COOKIE = "dash_project";

// Which project the dashboard is looking at. The switcher writes the cookie;
// every screen reads it here. Falls back to the default project so a stale or
// deleted slug can never blank the dashboard.
export async function getActiveProject(): Promise<Project> {
  const jar = await cookies();
  const slug = jar.get(PROJECT_COOKIE)?.value;
  if (slug) {
    const p = await getProjectBySlug(slug);
    if (p) return p;
  }
  const all = await listProjects();
  return all.find((p) => p.id === DEFAULT_PROJECT_ID) ?? all[0];
}
