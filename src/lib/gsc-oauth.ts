import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { db } from "./db";
import { decryptSecret, encryptSecret } from "./crypto";

// Google OAuth for Search Console - the "Connect Google Search Console"
// button (launch plan step 3). Scope is read-only search data, nothing else.
// This flow exists so (a) the Google verification demo video can show a real
// consent screen -> data roundtrip, and (b) the future cloud onboarding can
// grow out of it. The service-account path in gsc.ts stays the default for
// self-hosters; a project that connects OAuth just gains an alternative
// credential. Server-only: never import into client components.

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export function oauthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
}

function client(redirectUri: string) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    redirectUri,
  );
}

// CSRF state: HMAC-signed project slug + timestamp, keyed by the dashboard
// password (same key model as the auth cookie - rotating the password
// invalidates in-flight OAuth states, which is fine, they live minutes).
const STATE_TTL_MS = 10 * 60 * 1000;

function sign(payload: string): string {
  const secret = process.env.DASHBOARD_PASSWORD;
  if (!secret) throw new Error("Missing DASHBOARD_PASSWORD");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function makeState(projectSlug: string): string {
  const payload = `${projectSlug}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyState(state: string): string | null {
  const lastDot = state.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = state.slice(0, lastDot);
  const mac = state.slice(lastDot + 1);
  const expected = sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [slug, ts] = payload.split(".");
  if (!slug || !ts || Date.now() - Number(ts) > STATE_TTL_MS) return null;
  return slug;
}

export function consentUrl(redirectUri: string, projectSlug: string): string {
  return client(redirectUri).generateAuthUrl({
    access_type: "offline", // refresh token, so the connection survives
    prompt: "consent", // force the consent screen even on re-connect (demo video needs it)
    scope: [GSC_SCOPE],
    state: makeState(projectSlug),
  });
}

// Exchange the callback code and store the encrypted refresh token on the
// project. Returns an error string instead of throwing - the callback route
// turns it into a redirect with a message.
export async function connectProject(
  redirectUri: string,
  code: string,
  projectSlug: string,
): Promise<string | null> {
  try {
    const { tokens } = await client(redirectUri).getToken(code);
    if (!tokens.refresh_token) {
      return "Google returned no refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.";
    }
    const { error } = await db()
      .from("projects")
      .update({ gsc_oauth_refresh_token: encryptSecret(tokens.refresh_token) })
      .eq("slug", projectSlug);
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function disconnectProject(projectSlug: string): Promise<void> {
  await db()
    .from("projects")
    .update({ gsc_oauth_refresh_token: null })
    .eq("slug", projectSlug);
}

function oauthSearchConsole(refreshTokenEncrypted: string) {
  const auth = client("postmessage"); // redirect uri unused for refresh flows
  auth.setCredentials({ refresh_token: decryptSecret(refreshTokenEncrypted) });
  return google.searchconsole({ version: "v1", auth });
}

// The connected Google account's Search Console properties.
export async function oauthListSites(
  refreshTokenEncrypted: string,
): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const res = await oauthSearchConsole(refreshTokenEncrypted).sites.list();
  return (res.data.siteEntry ?? []).map((s) => ({
    siteUrl: s.siteUrl ?? "",
    permissionLevel: s.permissionLevel ?? "",
  }));
}

// A 28-day search-analytics sample from one property - what the connect page
// renders to prove the roundtrip works (and what the demo video shows).
export async function oauthSampleQuery(
  refreshTokenEncrypted: string,
  siteUrl: string,
): Promise<{
  totals: { clicks: number; impressions: number };
  topQueries: Array<{ query: string; clicks: number; impressions: number; position: number }>;
}> {
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 24 * 3600 * 1000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const res = await oauthSearchConsole(refreshTokenEncrypted).searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: ymd(start),
      endDate: ymd(end),
      dimensions: ["query"],
      rowLimit: 10,
    },
  });
  const rows = res.data.rows ?? [];
  const topQueries = rows.map((r) => ({
    query: (r.keys ?? [])[0] ?? "",
    clicks: r.clicks ?? 0,
    impressions: r.impressions ?? 0,
    position: Math.round((r.position ?? 0) * 10) / 10,
  }));
  const totals = topQueries.reduce(
    (acc, q) => ({ clicks: acc.clicks + q.clicks, impressions: acc.impressions + q.impressions }),
    { clicks: 0, impressions: 0 },
  );
  return { totals, topQueries };
}
