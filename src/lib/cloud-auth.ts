import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isCloudMode } from "@/lib/cloud";

// Supabase Auth for CLOUD_MODE deployments - real multi-user accounts, unlike
// the single-password gate in dashboard-auth.ts. Uses the anon key + the
// user's session cookies, so every call here acts AS the signed-in user; the
// service-role client in db.ts stays server-only and unrelated. Server-only
// module - never import from a client component.

function anonKey(): string | null {
  return process.env.SUPABASE_ANON_KEY ?? null;
}

// Only a CLOUD_MODE deployment has cloud users. A self-host run (local
// CLOUD_MODE=false against the same .env.local) still has the keys, and
// building an auth client there with a stale sb-* cookie in the jar makes
// auth-js log "Invalid Refresh Token" on every request - noise the proxy
// never clears, because its cookie sweep is also cloud-only.
export function cloudAuthConfigured(): boolean {
  return isCloudMode() && Boolean(process.env.SUPABASE_URL && anonKey());
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

// The project's JSON Web Key Set (its public signing keys), held on the
// instance across requests. supabase-js caches it per client, and a server
// client lives for one request, so without this every request would fetch
// the keys again before it could verify anything. Ten minutes, the TTL
// supabase-js itself uses; a key the set lacks (a rotation) makes getClaims
// fetch the live set on its own, so a stale copy here costs one round trip,
// never a wrong answer.
type Jwks = NonNullable<NonNullable<Parameters<SupabaseClient["auth"]["getClaims"]>[1]>["jwks"]>;
const JWKS_TTL_MS = 10 * 60_000;
let jwks: { set: Jwks; at: number } | null = null;

async function cachedJwks(url: string, anon: string): Promise<Jwks | undefined> {
  if (jwks && Date.now() - jwks.at < JWKS_TTL_MS) return jwks.set;
  try {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { headers: { apikey: anon }, signal: AbortSignal.timeout(5_000) });
    if (res.ok) {
      const body = (await res.json()) as Partial<Jwks>;
      if (Array.isArray(body.keys)) {
        jwks = { set: { keys: body.keys }, at: Date.now() };
        return jwks.set;
      }
    }
  } catch {
    // Fall through: getClaims fetches the keys itself when it needs them.
  }
  return jwks?.set;
}

// The signed-in user. Null = signed out, or cloud auth not configured.
//
// Verified LOCALLY: getClaims checks the session JWT's signature against the
// project's public keys (asymmetric signing, ES256 on this project) and its
// expiry, in-process. Before this it was a getUser() round trip to the Auth
// server at the head of every dashboard request - nothing else (the
// projects, the report) could start until it came back. Supabase's own
// guidance for server code is getClaims; getUser stays as its fallback for
// a legacy HS256 token or a runtime without WebCrypto, so the answer is the
// same either way. The trade is the usual JWT one: a session revoked
// elsewhere (a sign-out everywhere, a password reset, a ban, a deleted
// account) stays trusted until its access token expires, an hour at most.
// For page renders that is fine; the actions that destroy or move money
// (account deletion, billing) call currentUserStrict below instead, which
// still asks the server.
//
// React cache(): once per request. The layout, the auth gate, the onboarding
// gate, and active-project all call this on every dashboard render.
export const currentUser = cache(async (): Promise<CloudUser | null> => {
  if (!cloudAuthConfigured()) return null;
  try {
    const supabase = await supabaseAuth();
    const keys = await cachedJwks(process.env.SUPABASE_URL!, anonKey()!);
    const { data, error } = await supabase.auth.getClaims(undefined, keys ? { jwks: keys } : undefined);
    if (!error) {
      if (!data) return null; // no session in the jar
      const c = data.claims;
      // A user session and nothing else: the anon key is also a JWT, and
      // only the "authenticated" role and audience have an account behind
      // them.
      const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
      if (typeof c.sub === "string" && c.sub && c.role === "authenticated" && aud.includes("authenticated")) {
        return { id: c.sub, email: typeof c.email === "string" ? c.email : null };
      }
      return null;
    }
    // getClaims failed in a way it could not settle on its own (an expired
    // token it could not refresh, a key it could not fetch): ask the server,
    // the old way, so a verification hiccup never reads as signed out.
    const { data: u, error: userError } = await supabase.auth.getUser();
    if (userError || !u.user) return null;
    return { id: u.user.id, email: u.user.email ?? null };
  } catch {
    return null;
  }
});

// The signed-in user, confirmed by the Auth server right now - a session
// revoked a minute ago reads as signed out here, whatever its token says.
// One remote round trip, never cached: for the few actions where an hour of
// a copied cookie would cost real money or an account (deleteAccount, the
// Polar checkout and portal). Everything else uses currentUser.
export async function currentUserStrict(): Promise<CloudUser | null> {
  if (!cloudAuthConfigured()) return null;
  try {
    const supabase = await supabaseAuth();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}
