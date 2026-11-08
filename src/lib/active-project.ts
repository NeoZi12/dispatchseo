import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DEFAULT_PROJECT_ID,
  getProjectBySlug,
  listProjects,
  listProjectsForOwnerChecked,
  type Project,
} from "./projects";
import { isCloudMode } from "./cloud";
import { currentUser } from "./cloud-auth";
import { COOKIE_NAME, isValidCookie } from "./dashboard-auth";

export const PROJECT_COOKIE = "dash_project";

// Self-host: is this request signed in (a valid dash_auth cookie)? The
// dashboard layout renders alongside the page, before the page's own
// requireDashboard() redirect lands, so without this an anonymous visitor
// was streamed the project list and the active project in the layout's
// payload. Signed out sees no projects at all. cache(): checked once.
const selfHostSignedIn = cache(async (): Promise<boolean> => {
  const jar = await cookies();
  return isValidCookie(jar.get(COOKIE_NAME)?.value);
});

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
  return (await scopedProjectsChecked()).projects;
});

// Same query, but it also says whether the read FAILED as opposed to coming
// back genuinely empty. Only getActiveProject and the onboarding gate need
// this: they are the two places that turn "no projects" into a redirect, and
// redirecting a paying customer to the pricing page because Supabase hiccuped
// is the worst possible reading of a transient error.
export const scopedProjectsChecked = cache(
  async (): Promise<{ projects: Project[]; degraded: string | null }> => {
    if (isCloudMode()) {
      const user = await currentUser();
      if (!user) return { projects: [], degraded: null };
      return listProjectsForOwnerChecked(user.id);
    }
    // Self-host keeps the tolerant path: listProjects always yields at least the
    // synthetic fallback, so it never reaches a redirect on emptiness anyway.
    // Signed out gets nothing (the page redirects to /login on its own).
    if (!(await selfHostSignedIn())) return { projects: [], degraded: null };
    return { projects: await listProjects(), degraded: null };
  },
);

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
    const picked = mine.find((p) => p.slug === slug);
    if (picked) return picked;
    // Falling back to the first project. Intentional for RENDERING - a stale
    // or deleted slug must never blank the dashboard - but it means the screen
    // can be showing a different project than the cookie asked for, and that
    // silence has already cost us once: /onboarding resolved to the wrong
    // project and aimed a repo write at it (2026-07-26). Actions with external
    // side effects take an explicit slug instead of calling this. Logged
    // because the trigger is still unexplained: a cookie naming a project the
    // owner demonstrably has should not miss.
    if (slug) {
      console.warn(
        `[active-project] dash_project cookie "${slug}" matched none of ${mine.length} owned projects; falling back to "${mine[0].slug}"`,
      );
    }
    return mine[0];
  }
  if (!(await selfHostSignedIn())) return null;
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
  // Self-host only comes back null when signed out: that is a login, not a
  // missing site (and /plans is a cloud page).
  if (!p && !isCloudMode()) redirect("/login");
  if (!p) {
    // "We could not read your sites" must never be answered with "you have no
    // sites, here is our pricing". Throwing lands on the error boundary, whose
    // retry actually works the moment the blip passes - a redirect to /plans
    // just tells a paying customer their account is gone.
    const { degraded } = await scopedProjectsChecked();
    if (degraded) {
      throw new Error("We couldn't load your sites just now - refresh to try again.");
    }
    const { getSubscription, isActive } = await import("./billing");
    const user = await currentUser();
    const sub = user ? await getSubscription(user.id) : null;
    redirect(isActive(sub) ? "/onboarding?new=1" : "/plans");
  }
  return p;
}
