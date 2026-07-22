import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";

// Sign out and land on /login. Works for both modes: Supabase session in
// CLOUD_MODE, the dash_auth cookie on self-host.
export async function GET(req: NextRequest) {
  if (isCloudMode()) {
    try {
      const supabase = await supabaseAuth();
      await supabase.auth.signOut();
    } catch {
      // Not configured / already signed out - landing on /login is enough.
    }
  }
  const jar = await cookies();
  jar.delete("dash_auth");
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}
