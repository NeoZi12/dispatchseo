import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, isValidCookie } from "./dashboard-auth";
import { isCloudMode } from "./cloud";
import { currentUser, currentUserStrict, type CloudUser } from "./cloud-auth";

// The one dashboard auth gate. Every protected page/action/API route calls
// one of these instead of hand-rolling the cookie check, so the cloud/self-
// host split lives here alone:
//   self-host  -> the dash_auth HMAC cookie (dashboard-auth.ts), user null
//   CLOUD_MODE -> a Supabase Auth session (cloud-auth.ts), user set
// Returned user id is what project ownership scopes by (migration 0031).

export type DashboardAuth = { user: CloudUser | null };

// Pages: redirect to /login when signed out.
export async function requireDashboard(): Promise<DashboardAuth> {
  const auth = await dashboardAuth();
  if (!auth) redirect("/login");
  return auth;
}

// Actions + API routes: null when signed out (caller throws/401s).
export async function dashboardAuth(): Promise<DashboardAuth | null> {
  if (isCloudMode()) {
    const user = await currentUser();
    return user ? { user } : null;
  }
  const jar = await cookies();
  const ok = await isValidCookie(jar.get(COOKIE_NAME)?.value);
  return ok ? { user: null } : null;
}

// dashboardAuth, but the cloud session is confirmed by the Auth server on
// this call (cloud-auth.ts currentUserStrict): for the actions where a
// session revoked an hour ago must not still work - deleting the account.
export async function dashboardAuthStrict(): Promise<DashboardAuth | null> {
  if (isCloudMode()) {
    const user = await currentUserStrict();
    return user ? { user } : null;
  }
  return dashboardAuth();
}

// Cheap, UNVERIFIED "might this visitor be signed in?" hint. Public pages use
// it to skip dashboardAuth() for anonymous traffic, which in CLOUD_MODE costs
// a Supabase getUser() round-trip - not something every landing-page hit from
// search should pay. Cookie presence proves nothing (expired, forged, another
// deployment's), so this may only decide whether verifying is worth it; never
// gate anything protected on it.
export async function maybeSignedIn(): Promise<boolean> {
  const jar = await cookies();
  if (isCloudMode()) {
    // @supabase/ssr stores the session as sb-<project-ref>-auth-token, split
    // into .0/.1 chunks when it outgrows the 4KB cookie limit. The PKCE
    // -code-verifier cookie shares the prefix but is not a session, so it is
    // excluded - otherwise a mid-login visitor pays the verify round-trip.
    return jar
      .getAll()
      .some(
        (c) =>
          c.name.startsWith("sb-") &&
          c.name.includes("-auth-token") &&
          !c.name.includes("code-verifier") &&
          Boolean(c.value),
      );
  }
  return Boolean(jar.get(COOKIE_NAME)?.value);
}
