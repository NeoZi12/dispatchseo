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

// Client IP for the lockout/rate-limit key. Order matters for spoof-resistance:
// prefer x-vercel-forwarded-for (set by Vercel's edge, never client-supplied),
// then x-real-ip (also edge-set), and only fall back to the leftmost
// x-forwarded-for token last. On Vercel all three are identical and Vercel
// OVERWRITES inbound x-forwarded-for, so the value is the real client IP either
// way - this change is a no-op for the cloud deploy. It hardens SELF-HOST:
// behind your own reverse proxy (nginx/Caddy/Docker) you MUST have that proxy
// overwrite inbound x-forwarded-for (or set x-real-ip); otherwise a client can
// spoof the leftmost token and evade the lockout. The "unknown" bucket (local
// dev, exotic proxies) shares one counter, which at this scale is fine.
export function clientIp(hdrs: Headers): string {
  const vercel = hdrs.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercel) return vercel;
  const real = hdrs.get("x-real-ip")?.trim();
  if (real) return real;
  const first = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || "unknown";
}
