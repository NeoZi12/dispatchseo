import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { supabaseAuth } from "@/lib/cloud-auth";
import { captureServer } from "@/lib/posthog-server";
import { RECOVERY_COOKIE } from "@/lib/recovery-gate";
import { emailLinkMatches } from "@/lib/email-link-nonce";

// Email-link + OAuth landing for CLOUD_MODE (Supabase Auth). Two credential
// shapes arrive here, both of which establish the session cookies:
//   - `code`               - PKCE code from GitHub/Google sign-in and, with the
//                            default email template, from the password
//                            recovery link (exchangeCodeForSession). Needs the
//                            PKCE verifier cookie, so it's same-browser only.
//   - `token_hash` + type  - the device-independent email-OTP shape, used when
//                            the Supabase recovery template is switched to
//                            {{ .TokenHash }} (verifyOtp). Survives opening the
//                            link on a different device than it was requested.
// After the session is set we forward to `next` (a validated same-origin path,
// default /dashboard). Password recovery points `next` at /reset-password, so
// the user lands on the set-a-new-password form already signed in.

// Only same-origin absolute paths - blocks //evil.com and /\evil.com open
// redirects while still allowing /reset-password, /dashboard, etc.
function safeNext(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) {
    // Resolved, so "/reset-password/../x" is judged as the "/x" it really
    // is; the origin is a placeholder and never leaves this function.
    const u = new URL(raw, "http://callback.invalid");
    if (u.origin === "http://callback.invalid") return u.pathname + u.search;
  }
  return "/dashboard";
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  // Whether THIS credential is a password recovery. An emailed token_hash
  // link is one only when its own type says so - `next` is chosen by
  // whoever asked for the link, so it must never exempt a link from the
  // same-browser check below, nor earn the reset cookie (security review,
  // 2026-11-08). A code-grant (PKCE) link is already bound to this browser
  // by its verifier, so its `next` can be trusted for that.
  const rawNext = safeNext(params.get("next"));
  const isRecovery = tokenHash ? type === "recovery" : rawNext.startsWith("/reset-password");
  // A non-recovery sign-in never lands on the set-a-password form.
  const next = !isRecovery && rawNext.startsWith("/reset-password") ? "/dashboard" : rawNext;

  const url = req.nextUrl.clone();
  url.search = "";

  const fail = () => {
    url.pathname = isRecovery ? "/forgot-password" : "/login";
    url.search = isRecovery ? "?error=expired" : "?error=1";
    return NextResponse.redirect(url);
  };

  if (!code && !tokenHash) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  try {
    const supabase = await supabaseAuth();
    const { data, error } = tokenHash
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          // `signup` is normalized to `email` rather than passed through.
          // Supabase deprecates `signup` and `magiclink` on the client, and in
          // GoTrue `email` is a strict SUPERSET of both: verifyTokenHash's
          // email case looks the hash up against confirmation_token AND
          // recovery_token and rewrites the type itself, where the signup case
          // only ever checks confirmation_token. So `email` is the more
          // tolerant lookup and the shape every current official example uses.
          //
          // Normalizing here rather than only in the email template means a
          // dashboard template still emitting `type=signup` (the shape pasted
          // on 2026-07-30) keeps working without being re-pasted, and matters
          // for the resend path: auth.resend() is known to write a confirmation
          // token whose PKCE prefixing differs from the original signup's
          // (supabase/auth#1872), and the superset lookup is the one more
          // likely to survive that.
          type: (type === "signup" ? "email" : (type ?? "email")) as EmailOtpType,
        })
      : await supabase.auth.exchangeCodeForSession(code as string);
    if (error) return fail();
    // An emailed sign-in link opened in a browser that didn't ask for it:
    // signed straight back out, so a link forwarded by someone else can't put
    // this browser into THEIR account (lib/email-link-nonce.ts). Recovery
    // links are exempt.
    if (tokenHash && !isRecovery && !(await emailLinkMatches(params.get("sn")))) {
      // Only the session this link just made - never the account's other
      // sessions. The default (global) scope signed the real owner out of
      // every browser whenever a link was opened without its nonce: an old
      // link after a newer one, or a mail scanner following it (2026-11-08).
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      url.pathname = "/login";
      url.search = "?error=device";
      return NextResponse.redirect(url);
    }
    // The setup flow's sign-in (owner, 2026-11-08): the address this browser
    // checked becomes the new account's site, so /onboarding opens on the
    // next step instead of asking for it again. Best effort - the address
    // step can still do it by hand.
    if (!isRecovery && data.user && next.startsWith("/onboarding")) {
      const { createSiteAfterSignIn } = await import("@/lib/setup-flow");
      await createSiteAfterSignIn(data.user.id);
    }
    // Password recovery lands here too (both credential shapes), but signing
    // back in to set a new password isn't a login/signup event.
    if (!isRecovery && data.user) {
      if (tokenHash) {
        // Email-confirm link - signup() already fired user_signed_up when the
        // account row was created, this just closes the loop.
        await captureServer(data.user.id, "user_confirmed_email");
      } else {
        // The code-grant flows reaching here: GitHub and Google OAuth, and a
        // PKCE email link.
        const justCreated = Date.now() - new Date(data.user.created_at).getTime() < 15_000;
        const provider = typeof data.user.app_metadata?.provider === "string" ? data.user.app_metadata.provider : "oauth";
        await captureServer(data.user.id, justCreated ? "user_signed_up" : "user_logged_in", {
          method: provider,
        });
      }
    }
    // `next` may carry its own query string (e.g. /onboarding?new=1). Apply
    // path and query separately - assigning the whole string to .pathname
    // would percent-encode the `?` into the path and 404.
    const q = next.indexOf("?");
    url.pathname = q === -1 ? next : next.slice(0, q);
    url.search = q === -1 ? "" : next.slice(q);
    const res = NextResponse.redirect(url);
    // Proof that /reset-password was reached through a RECOVERY link, not just
    // by an already-signed-in browser. Supabase's updateUser({password}) will
    // change the password of whatever session is present and asks for no
    // current password, so without this marker the reset form was a
    // no-reauth account-takeover step for anyone holding a live session -
    // a borrowed laptop, a stolen cookie. Short-lived and httpOnly; the form
    // requires it and clears it on use.
    if (isRecovery && data.user) {
      res.cookies.set(RECOVERY_COOKIE, "1", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 15 * 60,
      });
    }
    return res;
  } catch {
    return fail();
  }
}
