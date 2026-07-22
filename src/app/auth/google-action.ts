"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseAuth } from "@/lib/cloud-auth";

// "Continue with Google" for CLOUD_MODE login/signup. Supabase Auth runs the
// OAuth dance (PKCE verifier lands in a cookie here, the code comes back on
// /auth/callback). Same button covers both new and returning users. This is
// SIGN-IN only - the Search Console permission stays a separate, later
// consent (the dashboard's Connect GSC button), so signup never asks for
// data scopes.
export async function googleSignIn() {
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
