import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { getProjectBySlug } from "@/lib/projects";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { authorizeUrl, GH_WANT_COOKIE, installUrl, userAuthConfigured } from "@/lib/github-app";
import { cookies } from "next/headers";
import { inheritGithubInstallation } from "@/lib/setup-flow";
import { NextResponse } from "next/server";
import { isCloudMode } from "@/lib/cloud";

// Kicks off the GitHub App install flow for a project. Same posture as the
// Google OAuth start route (api/oauth/google/start) - lives under /api/* so
// it re-checks the dashboard cookie itself - but resolves the project from
// ?slug= when given instead of only getActiveProject(): the onboarding
// wizard can be pointing at a project it just created, which isn't
// necessarily the active-cookie project yet. Ownership is verified the same
// way switchProject() in actions.ts checks it (assertProjectOwned, unguarded -
// an unowned slug throws rather than silently falling through), so a cloud
// user can't install the App onto another tenant's project by editing the
// query string.

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();
  // GitHub App install is cloud-only (self-host uses the merge token). 404 out
  // like the other cloud-only API routes - defense in depth; the self-host UI
  // never links here.
  if (!isCloudMode()) return NextResponse.json({ error: "not found" }, { status: 404 });

  const slug = new URL(req.url).searchParams.get("slug");
  const project = slug ? await getProjectBySlug(slug) : await getActiveProject();
  if (!project) redirect("/onboarding?gh=error&msg=unknown-project");

  await assertProjectOwned(project.id);
  // The owner's GitHub account already has the app (another of their sites):
  // there is nothing to install, so this site takes that installation and
  // goes straight to picking its repository. Only a new site still in setup
  // with no repository (inheritGithubInstallation refuses the rest): a site
  // that already has an installation is here to add a repository on GitHub,
  // and one that lost its installation ("reconnect GitHub") has to go to
  // GitHub for the one that covers its repository.
  if (!project.github_installation_id && (await inheritGithubInstallation(project))) {
    redirect(`/onboarding?gh=pick_repo&site=${encodeURIComponent(project.slug)}`);
  }
  // "I already installed it": the owner's GitHub account has the App, but
  // this site is not attached to it and no other site of theirs is either
  // (the attached site was removed, or their sites are connected another
  // way). GitHub's install link would show them a settings page with nothing
  // to press. GitHub's sign-in answers at once instead, and the callback
  // reads which installations are theirs. Only for a site with no repository
  // yet - a connected site's reconnect goes through the install link, which
  // names the installation.
  const params = new URL(req.url).searchParams;
  // Only from our own pages: a link on another site could otherwise walk a
  // signed-in owner through this with no click of theirs (GitHub answers an
  // already-authorized user at once) and change which of their own accounts
  // a site in setup points at.
  const foreign = req.headers.get("sec-fetch-site") === "cross-site";
  if (params.get("check") === "1" && !project.github_repo && userAuthConfigured() && !foreign) {
    // Which of their accounts, when they have several: a preference among
    // installations the callback proves are theirs, never trusted by itself.
    const want = Number(params.get("installation"));
    const jar = await cookies();
    if (Number.isSafeInteger(want) && want > 0) {
      jar.set(GH_WANT_COOKIE, String(want), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/github/install", maxAge: 600 });
    } else {
      jar.delete({ name: GH_WANT_COOKIE, path: "/api/github/install" });
    }
    redirect(await authorizeUrl(project.slug));
  }
  redirect(await installUrl(project.slug));
}
