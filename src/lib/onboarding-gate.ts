import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./db";
import { listProjects } from "./projects";
import { isCloudMode } from "./cloud";
import { scopedProjectsChecked } from "./active-project";

// "The wizard is a must": the dashboard stays locked until the OWNER'S side
// of setup is genuinely done. On self-host that means the pipeline install
// completed (the agent stamps pipeline_installed_at after the install PR
// merges); on cloud it means the wizard was walked to its finale, where the
// install fires itself and runs in the background. Until then every
// dashboard page funnels back to /onboarding, which resumes at the exact
// screen the owner stood on. Settings and the wizard itself stay reachable.
//
// Grandfathering + tolerance: projects created before the wizard tracked
// screens (onboarding_screen null, pre-0030) pass on a connected repo
// alone, and any DB error fails OPEN via listProjects (whose env-fallback
// row carries a repo) - a transient outage must never lock the owner out.
export const hasConfiguredProject = cache(async (): Promise<boolean> => {
  // CLOUD_MODE: the question is whether THIS user finished setup, not
  // whether any tenant on the deployment did - a neighbor's configured
  // project must not unlock a fresh account's dashboard. scopedProjects is
  // the request-cached user+projects lookup the layout and active-project
  // already share - reusing it makes this gate free instead of a second
  // auth round-trip + projects query on every page.
  //
  // "Finished" on cloud means the wizard reached its FINALE - c5, the screen
  // that fires the background pipeline install (stamped server-side by
  // runPipelineInstall, so a cancelled setWizardScreen POST can't lose it) -
  // or the install has already completed. A connected repo alone is NOT
  // enough: that's true from the repo-pick step on, and it used to unlock
  // the dashboard for owners who abandoned the wizard mid-flow - they came
  // back to a Home of zeros and a "setting up in the background" banner for
  // a run that was never fired (2026-07-28). Screenless rows still pass on a
  // repo alone: same pre-0030 grandfathering as self-host below.
  if (isCloudMode()) {
    const { projects: mine, degraded } = await scopedProjectsChecked();
    // Fail OPEN on a read error, the way the self-host branch below already
    // does. Answering "false" here bounces a fully-onboarded customer into the
    // add-a-site wizard because of a transient blip; answering "true" lets the
    // page render and surface the real error, which is recoverable by refresh.
    if (degraded) return true;
    return mine.some(
      (p) =>
        p.pipeline_installed_at != null ||
        p.onboarding_screen === "c5" ||
        (Boolean(p.github_repo) && p.onboarding_screen == null),
    );
  }
  try {
    // A WordPress project has no repo and so never gets a pipeline install to
    // stamp pipeline_installed_at - its "setup is done" is the finale stamp
    // finishWizard writes, the same rule the cloud branch above applies to c5.
    // publish_target is a later column (0055) than the rest, so a database
    // without it retries on the original three rather than failing open.
    type Row = {
      github_repo: string | null;
      pipeline_installed_at: string | null;
      onboarding_screen: string | null;
      publish_target?: string | null;
    };
    const full = await db()
      .from("projects")
      .select("github_repo, pipeline_installed_at, onboarding_screen, publish_target");
    const { data, error } = full.error
      ? await db().from("projects").select("github_repo, pipeline_installed_at, onboarding_screen")
      : full;
    if (!error && data) {
      return (data as unknown as Row[]).some(
        (p) =>
          p.pipeline_installed_at != null ||
          // (setWizardScreen refuses to move a finished WordPress project off
          // s5, so this stamp is as monotonic as pipeline_installed_at.)
          (p.publish_target === "wordpress" && p.onboarding_screen === "s5") ||
          (Boolean(p.github_repo) && p.onboarding_screen == null),
      );
    }
  } catch {
    // fall through to the tolerant path
  }
  const all = await listProjects();
  return all.some((p) => Boolean(p.github_repo) || p.publish_target === "wordpress");
});

// Call after the page's auth check. Pages, not layout, because the
// (dashboard) route group's layout also wraps /onboarding itself - and the
// no-middleware convention means every page guards itself anyway.
export async function requireOnboarded(): Promise<void> {
  if (!(await hasConfiguredProject())) redirect("/onboarding");
}
