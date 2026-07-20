import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client. This backend has no user auth - every caller is trusted
// server code (the MCP tools and the crons), so we always use the service role,
// which bypasses RLS. Never import this into anything that ships to a browser.
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;

  // Docker self-host mode: POSTGREST_URL points at a plain PostgREST container
  // (docker-compose.yml) instead of Supabase cloud. supabase-js speaks the
  // PostgREST protocol already - the only differences are the /rest/v1 path
  // prefix (Supabase's gateway route, absent on bare PostgREST) and the auth
  // headers (bare PostgREST has no JWT configured; a stray Bearer token would
  // 401, and the compose network is internal-only so requests need no auth).
  const postgrestUrl = process.env.POSTGREST_URL?.replace(/\/$/, "");
  if (postgrestUrl) {
    cached = createClient(postgrestUrl, "self-hosted-no-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const url = (input instanceof Request ? input.url : String(input)).replace(
            `${postgrestUrl}/rest/v1`,
            postgrestUrl,
          );
          const headers = new Headers(init?.headers);
          headers.delete("authorization");
          headers.delete("apikey");
          return fetch(url, { ...init, headers });
        },
      },
    });
    return cached;
  }

  const url = process.env.SUPABASE_URL;
  // SUPABASE_SECRET_KEY is what the Vercel Marketplace integration injects
  // (Supabase's post-2026 key naming); SERVICE_ROLE_KEY is the classic name
  // used by manual setups. Same power, either works.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
