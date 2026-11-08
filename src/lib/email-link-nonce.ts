import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Binds an emailed sign-in link to the browser that asked for it.
//
// The email templates use the {{ .TokenHash }} link shape so a link works
// without the PKCE verifier cookie. That also means a link works for ANYONE
// who opens it: someone could request a link for their own inbox and send it
// to a prospect ("your DispatchSEO setup link"), and the prospect's browser
// would be signed into the sender's account - then pay, connect GitHub and
// grant Search Console into it (security review, 2026-11-08). So the link
// carries a random value that is also in this browser's cookie, and
// /auth/callback signs a token_hash sign-in straight back out when the two
// don't match. Password-reset links carry the same value (forgot-password
// mints it) and get the same check: a forwarded reset link would otherwise
// sign this browser into the sender's account with a reset form in front.

export const EMAIL_LINK_COOKIE = "email_link_nonce";
const TTL_S = 60 * 60;

/** Server actions and route handlers only (writes a cookie). */
export async function mintEmailLinkNonce(): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  (await cookies()).set(EMAIL_LINK_COOKIE, nonce, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TTL_S,
  });
  return nonce;
}

/** Does the link's value match this browser's cookie? */
export async function emailLinkMatches(fromLink: string | null): Promise<boolean> {
  const mine = (await cookies()).get(EMAIL_LINK_COOKIE)?.value;
  if (!mine || !fromLink || mine.length !== fromLink.length) return false;
  return timingSafeEqual(Buffer.from(mine), Buffer.from(fromLink));
}
