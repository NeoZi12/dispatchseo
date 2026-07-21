import { redirect } from "next/navigation";
import { db } from "./db";
import { listProjects } from "./projects";

// "The wizard is a must": the dashboard stays locked until the OWNER'S side
// of setup is genuinely done - which means the pipeline install completed
// (the agent stamps pipeline_installed_at after the install PR merges).
// Until then every dashboard page funnels back to /onboarding, which
// resumes at the exact screen the owner stood on. Settings and the wizard
// itself stay reachable.
//
// Grandfathering + tolerance: projects created before the wizard tracked
// screens (onboarding_screen null, pre-0030) pass on a connected repo
// alone, and any DB error fails OPEN via listProjects (whose env-fallback
// row carries a repo) - a transient outage must never lock the owner out.
export async function hasConfiguredProject(): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("projects")
      .select("github_repo, pipeline_installed_at, onboarding_screen");
    if (!error && data) {
      return (data as Array<{
        github_repo: string | null;
        pipeline_installed_at: string | null;
        onboarding_screen: string | null;
      }>).some(
        (p) =>
          p.pipeline_installed_at != null ||
          (Boolean(p.github_repo) && p.onboarding_screen == null),
      );
    }
  } catch {
    // fall through to the tolerant path
  }
  const all = await listProjects();
  return all.some((p) => Boolean(p.github_repo));
}

// Call after the page's auth check. Pages, not layout, because the
// (dashboard) route group's layout also wraps /onboarding itself - and the
// no-middleware convention means every page guards itself anyway.
export async function requireOnboarded(): Promise<void> {
  if (!(await hasConfiguredProject())) redirect("/onboarding");
}
