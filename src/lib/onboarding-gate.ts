import { redirect } from "next/navigation";
import { listProjects } from "./projects";

// "The wizard is a must": a fresh instance has exactly one NEUTRAL project
// (the fixed-id row setup.sql seeds) and zero sites connected, and every
// dashboard surface assumes a configured project behind it. Until the
// onboarding wizard's first step has run - which claims that row with a real
// domain + repo - the dashboard pages funnel back to /onboarding instead of
// rendering half-broken. Settings and the wizard itself stay reachable.
//
// "Configured" = any project with a GitHub repo connected, the one field
// onboarding cannot skip. listProjects' env-fallback row (deploy-window DB
// tolerance) carries a repo, so a transient DB error can never lock the
// owner out of their dashboard.
export async function hasConfiguredProject(): Promise<boolean> {
  const all = await listProjects();
  return all.some((p) => Boolean(p.github_repo));
}

// Call after the page's auth check. Pages, not layout, because the
// (dashboard) route group's layout also wraps /onboarding itself - and the
// no-middleware convention means every page guards itself anyway.
export async function requireOnboarded(): Promise<void> {
  if (!(await hasConfiguredProject())) redirect("/onboarding");
}
