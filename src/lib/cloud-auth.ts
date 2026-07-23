import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Supabase Auth for CLOUD_MODE deployments - real multi-user accounts, unlike
// the single-password gate in dashboard-auth.ts. Uses the anon key + the
// user's session cookies, so every call here acts AS the signed-in user; the
// service-role client in db.ts stays server-only and unrelated. Server-only
// module - never import from a client component.

function anonKey(): string | null {
  return process.env.SUPABASE_ANON_KEY ?? null;
}

export function cloudAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && anonKey());
}

// A request-scoped Supabase client bound to the caller's auth cookies.
// getAll/setAll is the @supabase/ssr contract; setAll throws inside server
// components (cookies are read-only there), which the library tolerates -
// the session just doesn't refresh until a server action or route runs.
export async function supabaseAuth() {
  const url = process.env.SUPABASE_URL;
  const key = anonKey();
  if (!url || !key) throw new Error("Cloud auth needs SUPABASE_URL and SUPABASE_ANON_KEY");
  const jar = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return jar.getAll();
      },
      setAll(toSet) {
        try {
          for (const { name, value, options } of toSet) jar.set(name, value, options);
        } catch {
          // Server component render - cookie writes are not allowed here.
        }
      },
    },
  });
}

export type CloudUser = { id: string; email: string | null };

// The signed-in user, validated against the Supabase Auth server (getUser
// verifies the JWT remotely - never trust getSession alone for auth
// decisions). Null = signed out, or cloud auth not configured.
//
// React cache(): the remote getUser round-trip runs ONCE per request. The
// layout, the auth gate, the onboarding gate, and active-project all call
// this on every dashboard render - uncached that was ~5 sequential auth
// round-trips per navigation.
export const currentUser = cache(async (): Promise<CloudUser | null> => {
  if (!cloudAuthConfigured()) return null;
  try {
    const supabase = await supabaseAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
});
