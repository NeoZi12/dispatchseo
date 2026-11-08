"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/cloud-auth";
import { cleanDomain, isValidDomain } from "@/lib/domain";
import { authCallbackUrl } from "@/lib/origin";

// "Continue with Google" for CLOUD_MODE login/signup. Supabase Auth runs the
// OAuth dance (PKCE verifier lands in a cookie here, the code comes back on
// /auth/callback). Same button covers both new and returning users. This is
// SIGN-IN only - the Search Console permission stays a separate, later
// consent (the dashboard's Connect GSC button), so signup never asks for
// data scopes.
export async function googleSignIn(formData: FormData) {
  // Signing UP through Google forms the contract just as much as the email
  // form does, so the same clickwrap applies. /login posts no mode and is
  // untouched: a returning user has already accepted, and there is no box on
  // that page to tick.
  if (formData.get("mode") === "signup" && formData.get("accept") !== "yes") {
    redirect("/signup?error=terms");
  }
  // The landing hero's typed domain rides a hidden field; stash it in the
  // cookie the onboarding wizard prefills from. The OAuth redirect would
  // drop a query param, a cookie survives the round-trip.
  const domain = cleanDomain(String(formData.get("domain") ?? ""));
  if (isValidDomain(domain)) {
    (await cookies()).set("pending_domain", domain, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: await authCallbackUrl(),
      // Without prompt=select_account Google silently reuses whichever
      // account the browser last authorised, so a second person (or a
      // second test account) on the same computer clicks "Continue with
      // Google" and lands in the FIRST account's dashboard with no chooser
      // and no way to tell it happened. Always ask which account.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) redirect("/login?error=1");
  redirect(data.url);
}

// "Continue with GitHub" on /login - same shape as Google above. Most owners
// signed up with GitHub (the setup's first button), so it's the first way
// back in. Setup's own sign-in lives in app/onboarding/setup-actions.ts.
export async function githubSignIn() {
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: await authCallbackUrl() },
  });
  if (error || !data?.url) redirect("/login?error=1");
  redirect(data.url);
}
