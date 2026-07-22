"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/cloud-auth";
import { cleanDomain, isValidDomain } from "@/lib/domain";

// "Continue with Google" for CLOUD_MODE login/signup. Supabase Auth runs the
// OAuth dance (PKCE verifier lands in a cookie here, the code comes back on
// /auth/callback). Same button covers both new and returning users. This is
// SIGN-IN only - the Search Console permission stays a separate, later
// consent (the dashboard's Connect GSC button), so signup never asks for
// data scopes.
export async function googleSignIn(formData: FormData) {
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
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${proto}://${host}/auth/callback` },
  });
  if (error || !data?.url) redirect("/login?error=1");
  redirect(data.url);
}
