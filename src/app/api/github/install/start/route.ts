import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import { getActiveProject } from "@/lib/active-project";
import { getProjectBySlug } from "@/lib/projects";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { installUrl } from "@/lib/github-app";
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
  redirect(await installUrl(project.slug));
}
