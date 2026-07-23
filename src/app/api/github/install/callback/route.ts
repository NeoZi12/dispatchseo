import { redirect, unstable_rethrow } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { verifyState } from "@/lib/gsc-oauth";
import { getProjectBySlug } from "@/lib/projects";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { getInstallation, listInstallationRepos } from "@/lib/github-app";
import { db } from "@/lib/db";

// GitHub redirects here after the App install/update flow - this URL is the
// App's fixed "Setup URL" (set once in the App's own GitHub settings), so it
// is hit both right after a fresh install AND whenever the owner revisits
// GitHub to change which repos the App can see (setup_action distinguishes
// the two, but both resolve the same way below).
//
// state only comes back when the flow started at our own
// /api/github/install/start (the wizard's "Connect GitHub" button, which
// signs the originating project's slug into it) - a bare "Install" click
// from github.com/apps/... arrives with no state at all, so that path is
// handled separately below.
//
// getInstallation() is not optional plumbing: installation_id is a caller-
// supplied, unauthenticated query param at this point. Without checking it
// against the App's own installations list, anyone could point this route at
// an installation_id belonging to a completely different app/org and get it
// wired into their project.

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();

  const url = new URL(req.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  // GitHub always sends this ("install" | "update"); not branched on - a
  // fresh install and a repo-selection update both resolve through the same
  // logic below.
  const setupAction = url.searchParams.get("setup_action");

  const installationId = installationIdRaw ? Number(installationIdRaw) : NaN;

  try {
    if (!Number.isFinite(installationId)) {
      redirect("/onboarding?gh=error&msg=bad-installation-id");
    }

    const slug = state ? await verifyState(state) : null;

    if (slug) {
      const project = await getProjectBySlug(slug);
      if (!project) redirect("/onboarding?gh=error&msg=unknown-project");
      await assertProjectOwned(project.id);

      const installation = await getInstallation(installationId);
      if (!installation) redirect("/onboarding?gh=error&msg=install-not-found");

      const repos = await listInstallationRepos(installationId);
      const patch: Record<string, unknown> = {
        github_installation_id: installationId,
        github_app_installed_at: new Date().toISOString(),
      };
      // Exactly one repo -> auto-attach it; anything else (owner picked
      // "all repos", multiple, or somehow zero) needs the owner to choose.
      if (repos.length === 1) patch.github_repo = repos[0].full_name;

      const { error } = await db().from("projects").update(patch).eq("id", project.id);
      if (error) redirect("/onboarding?gh=error&msg=save-failed");

      redirect(repos.length === 1 ? "/onboarding?gh=installed" : "/onboarding?gh=pick_repo");
    }

    // No usable state: installed straight from github.com (or the signed
    // state expired). Confirm the installation is genuinely ours, then hand
    // off to the wizard's interrupt screen to ask which project it's for -
    // nothing is written yet, so an install can't get silently attached to
    // the wrong tenant.
    const installation = await getInstallation(installationId);
    if (!installation) redirect("/onboarding?gh=error&msg=install-not-found");
    redirect(`/onboarding?gh=pick_project&installation_id=${installationId}`);
  } catch (e) {
    unstable_rethrow(e); // let the redirect()s above pass through untouched
    console.error(
      `[github-app] install callback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    redirect("/onboarding?gh=error&msg=callback-failed");
  }
}
