import { db } from "./db";

// Login brute-force lockout (migration 0021): 5 failed attempts from one IP
// inside 15 minutes lock that IP for 15 minutes. The count lives in Postgres
// (atomic via the record_login_failure function), so it holds across
// serverless instances. Everything is tolerant of the migration not having
// run yet - a missing table/function fails OPEN (no lockout, login still
// works), matching the projects.ts tolerance posture.

export async function loginLockedUntil(ip: string): Promise<Date | null> {
  const { data, error } = await db()
    .from("login_attempts")
    .select("locked_until")
    .eq("ip", ip)
    .maybeSingle();
  if (error || !data?.locked_until) return null;
  const until = new Date(data.locked_until as string);
  return until > new Date() ? until : null;
}

// Returns the lock expiry if this failure tripped (or extended) the lock.
export async function recordLoginFailure(ip: string): Promise<Date | null> {
  const { data, error } = await db().rpc("record_login_failure", { attempt_ip: ip });
  if (error) {
    console.error("[login-lockout] record_login_failure failed:", error.message);
    return null;
  }
  if (!data) return null;
  const until = new Date(data as string);
  return until > new Date() ? until : null;
}

export async function clearLoginFailures(ip: string): Promise<void> {
  await db().from("login_attempts").delete().eq("ip", ip);
}

// First hop of x-forwarded-for is the client; Vercel sets it reliably. The
// "unknown" bucket (local dev, exotic proxies) still gets a counter - a
// shared one, which at this scale is a feature, not a bug.
export function clientIp(hdrs: Headers): string {
  const xff = hdrs.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return hdrs.get("x-real-ip")?.trim() || "unknown";
}
