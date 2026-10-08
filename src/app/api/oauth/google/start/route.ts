import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveProject } from "@/lib/active-project";
import { getProjectBySlug } from "@/lib/projects";
import { assertProjectOwned } from "@/lib/tenant-guard";
import { consentUrl, oauthConfigured, type OauthReturnTo } from "@/lib/gsc-oauth";
import { db } from "@/lib/db";

// Kicks off the Google OAuth consent flow for a project. Lives under /api/*
// (outside the proxy's cookie gate), so it re-checks the dashboard cookie
// itself - same posture as every protected page.
//
// ?slug= names the project explicitly (the setup path's links always pass
// it): the active-project cookie is per-browser, so another tab switching
// sites between render and click would otherwise connect Google to the
// wrong one. The slug is ownership-checked; without it, the active project
// (unchanged behaviour for every older link).

export async function GET(req: Request): Promise<Response> {
  await requireDashboard();
  if (!oauthConfigured()) {
    return Response.json(
      { error: "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set." },
      { status: 500 },
    );
  }
  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  let project;
  if (slug) {
    const named = await getProjectBySlug(slug);
    if (!named) return Response.json({ error: "Unknown project." }, { status: 404 });
    // Throws "Not found" for a project the caller doesn't own (cloud).
    try {
      await assertProjectOwned(named.id);
    } catch {
      return Response.json({ error: "Unknown project." }, { status: 404 });
    }
    project = named;
  } else {
    project = await getActiveProject();
  }
  // The wizard's connect button passes ?returnTo=onboarding so the callback
  // lands back mid-wizard; the setup path's Home hero passes
  // ?returnTo=dashboard; anything else keeps the /google default.
  const rawReturnTo = url.searchParams.get("returnTo");
  const returnTo: OauthReturnTo =
    rawReturnTo === "onboarding" || rawReturnTo === "dashboard" ? rawReturnTo : "google";
  // Persist the wizard screen server-side before this full-page bounce to
  // Google. The client's fire-and-forget setWizardScreen("c3") can be cancelled
  // by the navigation; a lost screen makes buildCloudResume default past the
  // publish-mode step (c4), so the owner's Semi/Auto pick is silently skipped
  // and mode stays on the default. Stamping c3 here guarantees the return lands
  // on the property-pick step and continues through c4. Onboarding only.
  //
  // Never once the connect phase is stamped (setup_connected_at): a Google
  // connect picked back up after setup must not rewind a "c5" row to "c3" -
  // the gate and retrySetupIfNeverStarted (setup-retry.ts) both read c5 [R7].
  if (returnTo === "onboarding" && !project.setup_connected_at) {
    await db().from("projects").update({ onboarding_screen: "c3" }).eq("id", project.id);
  }
  redirect(await consentUrl(`${origin}/api/oauth/google/callback`, project.slug, returnTo));
}
