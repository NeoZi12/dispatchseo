import { NextResponse, type NextRequest } from "next/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { supabaseAuth } from "@/lib/cloud-auth";

// Email-link + OAuth landing for CLOUD_MODE (Supabase Auth). Two credential
// shapes arrive here, both of which establish the session cookies:
//   - `code`               - PKCE code from Google sign-in and, with the
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
    return raw;
  }
  return "/dashboard";
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  const next = safeNext(params.get("next"));
  // A recovery flow should recover from a dead link by asking for another,
  // not by dropping the user on a generic sign-in error they can't act on.
  const isRecovery = type === "recovery" || next.startsWith("/reset-password");

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
    const { error } = tokenHash
      ? await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: (type ?? "email") as EmailOtpType,
        })
      : await supabase.auth.exchangeCodeForSession(code as string);
    if (error) return fail();
    url.pathname = next;
    return NextResponse.redirect(url);
  } catch {
    return fail();
  }
}
