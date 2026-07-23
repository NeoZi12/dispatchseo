import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveProject } from "@/lib/active-project";
import { consentUrl, oauthConfigured } from "@/lib/gsc-oauth";

// Kicks off the Google OAuth consent flow for the active project. Lives under
// /api/* (outside the proxy's cookie gate), so it re-checks the dashboard
// cookie itself - same posture as every protected page.

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
  const project = await getActiveProject();
  // The wizard's connect button passes ?returnTo=onboarding so the callback
  // lands back mid-wizard; anything else keeps the /google default.
  const returnTo =
    new URL(req.url).searchParams.get("returnTo") === "onboarding" ? "onboarding" : "google";
  redirect(await consentUrl(`${origin}/api/oauth/google/callback`, project.slug, returnTo));
}
