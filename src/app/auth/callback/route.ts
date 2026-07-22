import { NextResponse, type NextRequest } from "next/server";
import { supabaseAuth } from "@/lib/cloud-auth";

// OAuth landing for CLOUD_MODE sign-in (Google via Supabase Auth). Supabase
// redirects here with a PKCE code; exchanging it sets the session cookies,
// then the user continues into the app. Signups and sign-ins share this
// route - a first-time Google user is created by the exchange itself.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const url = req.nextUrl.clone();
  url.search = "";
  if (!code) {
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  try {
    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    url.pathname = error ? "/login" : "/dashboard";
    if (error) url.search = "?error=1";
  } catch {
    url.pathname = "/login";
    url.search = "?error=1";
  }
  return NextResponse.redirect(url);
}
