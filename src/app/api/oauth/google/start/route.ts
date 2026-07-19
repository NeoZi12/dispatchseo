import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { getActiveProject } from "@/lib/active-project";
import { consentUrl, oauthConfigured } from "@/lib/gsc-oauth";

// Kicks off the Google OAuth consent flow for the active project. Lives under
// /api/* (outside the proxy's cookie gate), so it re-checks the dashboard
// cookie itself - same posture as every protected page.

export async function GET(): Promise<Response> {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");
  if (!oauthConfigured()) {
    return Response.json(
      { error: "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET are not set." },
      { status: 500 },
    );
  }
  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;
  const project = await getActiveProject();
  redirect(consentUrl(`${origin}/api/oauth/google/callback`, project.slug));
}
