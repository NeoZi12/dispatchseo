import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "./dashboard-auth";
import { isCloudMode } from "./cloud";
import { currentUser, type CloudUser } from "./cloud-auth";

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
  const ok = await isValidCookie(jar.get("dash_auth")?.value);
  return ok ? { user: null } : null;
}
