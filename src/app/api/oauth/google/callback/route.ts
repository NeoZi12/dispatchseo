import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { connectProject, verifyState } from "@/lib/gsc-oauth";

// Google redirects here after consent. Verifies the signed state (CSRF),
// exchanges the code, stores the encrypted refresh token on the project the
// flow started from, then lands back on the connect page.

export async function GET(req: Request): Promise<Response> {
  const jar = await cookies();
  if (!isValidCookie(jar.get("dash_auth")?.value)) redirect("/login");

  const url = new URL(req.url);
  const denied = url.searchParams.get("error");
  if (denied) redirect(`/google?error=${encodeURIComponent(denied)}`);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const slug = state ? verifyState(state) : null;
  if (!code || !slug) redirect("/google?error=bad_state");

  const hdrs = await headers();
  const origin = `${hdrs.get("x-forwarded-proto") ?? "https"}://${hdrs.get("host")}`;
  const err = await connectProject(`${origin}/api/oauth/google/callback`, code, slug);
  redirect(err ? `/google?error=${encodeURIComponent(err)}` : "/google?connected=1");
}
