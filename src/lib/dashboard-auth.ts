import { createHmac, timingSafeEqual } from "node:crypto";

// Single-user password gate. The auth cookie is an HMAC of a fixed message
// keyed by DASHBOARD_PASSWORD, so changing the password invalidates every
// existing session. No sessions table, no user model - one human.

const COOKIE_NAME = "dash_auth";
const MESSAGE = "seo-dashboard-v1";

export { COOKIE_NAME };

export function cookieValue(): string {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) throw new Error("Missing DASHBOARD_PASSWORD");
  return createHmac("sha256", secret).update(MESSAGE).digest("hex");
}

export function isValidCookie(value: string | undefined): boolean {
  if (!value || !process.env.DASHBOARD_PASSWORD) return false;
  const expected = cookieValue();
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isCorrectPassword(attempt: string): boolean {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) return false;
  const a = Buffer.from(attempt);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
