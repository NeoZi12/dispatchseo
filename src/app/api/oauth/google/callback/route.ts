import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectProject, verifyStateDetailed, type OauthReturnTo } from "@/lib/gsc-oauth";
import { getProjectBySlug } from "@/lib/projects";
import { ownedProjectIds } from "@/lib/tenant-guard";

// Google redirects here after consent. Verifies the signed state (CSRF),
// exchanges the code, stores the encrypted refresh token on the project the
// flow started from, then lands back where the flow began - the /google
// connect page, mid-wizard when onboarding kicked it off, or Home when the
// setup path's hero did.

function landing(returnTo: OauthReturnTo, params: string): string {
  if (returnTo === "onboarding") return `/onboarding?${params}`;
  // The Home hero's Google step (a connect parked during setup): back to
  // Home, where the hero renders ?connected=1 / ?error=… on its own card.
  if (returnTo === "dashboard") return `/dashboard?${params}`;
  return `/google?${params}`;
}

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const detailed = state ? await verifyStateDetailed(state) : null;
  const returnTo: OauthReturnTo = detailed?.returnTo ?? "google";

  const denied = url.searchParams.get("error");
  if (denied) redirect(landing(returnTo, `error=${encodeURIComponent(denied)}`));

  const code = url.searchParams.get("code");
  if (!code || !detailed) redirect(landing(returnTo, "error=bad_state"));

  // The signed state proves the URL came from us; it does NOT prove it was
  // minted for the browser that is redeeming it. Nothing stops one signed-in
  // customer from starting a flow for their own project, handing the resulting
  // callback URL to someone else, and having THAT person's Google consent -
  // and the long-lived refresh token it mints - written onto the attacker's
  // project row. Re-check ownership here, against the session that actually
  // arrived, before connectProject() stores anything (2026-07-27).
  const project = await getProjectBySlug(detailed.slug);
  if (!project) redirect(landing(returnTo, "error=unknown_project"));
  const owned = await ownedProjectIds(); // null on self-host = single owner, no-op
  if (owned && !owned.has(project.id)) {
    redirect(landing(returnTo, "error=not_your_project"));
  }

  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;
  const err = await connectProject(`${origin}/api/oauth/google/callback`, code, detailed.slug);
  redirect(err ? landing(returnTo, `error=${encodeURIComponent(err)}`) : landing(returnTo, "connected=1"));
}
