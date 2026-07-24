import { redirect, unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { requireDashboard } from "@/lib/auth-gate";
import { verifyState } from "@/lib/gsc-oauth";
import { getProjectBySlug } from "@/lib/projects";
import { assertInstallationClaimable, assertProjectOwned } from "@/lib/tenant-guard";
import { getInstallation, listInstallationRepos, makeInstallNonce } from "@/lib/github-app";
import { db } from "@/lib/db";
import { isCloudMode } from "@/lib/cloud";

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
  // GitHub App install is cloud-only (self-host uses the merge token). 404 out
  // like the other cloud-only API routes - defense in depth.
  if (!isCloudMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

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
      // installation_id is an enumerable integer from the query string; state
      // proves the caller owns the PROJECT, not the installation. Refuse one
      // already bound to another tenant, or a signed-in attacker could wire a
      // victim's installation into their own project and write to the
      // victim's repo through our App.
      await assertInstallationClaimable(installationId);

      const installation = await getInstallation(installationId);
      if (!installation) redirect("/onboarding?gh=error&msg=install-not-found");

      const repos = await listInstallationRepos(installationId);
      const patch: Record<string, unknown> = {
        github_installation_id: installationId,
        github_app_installed_at: new Date().toISOString(),
      };
      // Exactly one repo -> auto-attach it; anything else (owner picked
      // "all repos", multiple, or somehow zero) needs the owner to choose.
      // Never overwrite a repo already chosen: a later App reinstall/update
      // (e.g. granting a different single repo) must not silently repoint an
      // already-connected project - same guard as attachGithubInstallation.
      if (repos.length === 1 && !project.github_repo) patch.github_repo = repos[0].full_name;

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
    // No signed state proves WHO installed this. Drop an httpOnly HMAC nonce
    // tying THIS browser to THIS installation_id; attachGithubInstallation
    // requires it back, so a signed-in attacker guessing the (enumerable) id
    // can't bind a victim's fresh install to their own project.
    const res = NextResponse.redirect(
      new URL(`/onboarding?gh=pick_project&installation_id=${installationId}`, req.url),
    );
    res.cookies.set("gh_install_nonce", await makeInstallNonce(installationId), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor((15 * 60 * 1000) / 1000),
    });
    return res;
  } catch (e) {
    unstable_rethrow(e); // let the redirect()s above pass through untouched
    console.error(
      `[github-app] install callback failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    redirect("/onboarding?gh=error&msg=callback-failed");
  }
}
