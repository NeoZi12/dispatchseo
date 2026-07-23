import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEFAULT_PROJECT_ID,
  getProjectBySlug,
  listProjects,
  listProjectsForOwner,
  type Project,
} from "./projects";
import { isCloudMode } from "./cloud";
import { currentUser } from "./cloud-auth";

export const PROJECT_COOKIE = "dash_project";

// The projects this request is allowed to see: the signed-in user's own in
// CLOUD_MODE (may genuinely be empty for a fresh account), everything on
// self-host. The dashboard layout's switcher and every "which project" lookup
// go through this, so a cloud user can never reach another tenant by editing
// the dash_project cookie.
//
// React cache(): one projects query per request, however many of the layout /
// gates / page call this - they all did, and each call was its own DB
// round-trip (plus a remote auth check in CLOUD_MODE) before the dedupe.
export const scopedProjects = cache(async (): Promise<Project[]> => {
  if (isCloudMode()) {
    const user = await currentUser();
    if (!user) return [];
    return listProjectsForOwner(user.id);
  }
  return listProjects();
});

// Which project the dashboard is looking at, or null when a cloud account
// has none yet. The switcher writes the cookie; every screen reads it here.
// Falls back to the default/first project so a stale or deleted slug can
// never blank the dashboard. cache(): resolved once per request.
export const getActiveProjectOrNull = cache(async (): Promise<Project | null> => {
  const jar = await cookies();
  const slug = jar.get(PROJECT_COOKIE)?.value;
  if (isCloudMode()) {
    const mine = await scopedProjects();
    if (mine.length === 0) return null;
    return mine.find((p) => p.slug === slug) ?? mine[0];
  }
  if (slug) {
    const p = await getProjectBySlug(slug);
    if (p) return p;
  }
  const all = await listProjects();
  return all.find((p) => p.id === DEFAULT_PROJECT_ID) ?? all[0];
});

// The non-null contract almost every screen relies on. A cloud account with
// zero projects is sent to the right next step: pick a plan first (no active
// subscription -> /plans, the standalone pricing page), then the add-a-site
// wizard. Both destinations tolerate having no project.
export async function getActiveProject(): Promise<Project> {
  const p = await getActiveProjectOrNull();
  if (!p) {
    const { getSubscription, isActive } = await import("./billing");
    const user = await currentUser();
    const sub = user ? await getSubscription(user.id) : null;
    redirect(isActive(sub) ? "/onboarding?new=1" : "/plans");
  }
  return p;
}
