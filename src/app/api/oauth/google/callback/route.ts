import { requireDashboard } from "@/lib/auth-gate";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connectProject, verifyStateDetailed, type OauthReturnTo } from "@/lib/gsc-oauth";

// Google redirects here after consent. Verifies the signed state (CSRF),
// exchanges the code, stores the encrypted refresh token on the project the
// flow started from, then lands back where the flow began - the /google
// connect page, or mid-wizard when onboarding kicked it off.

function landing(returnTo: OauthReturnTo, params: string): string {
  return returnTo === "onboarding" ? `/onboarding?${params}` : `/google?${params}`;
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

  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;
  const err = await connectProject(`${origin}/api/oauth/google/callback`, code, detailed.slug);
  redirect(err ? landing(returnTo, `error=${encodeURIComponent(err)}`) : landing(returnTo, "connected=1"));
}
