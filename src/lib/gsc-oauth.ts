import { createHmac, timingSafeEqual } from "node:crypto";
import { google } from "googleapis";
import { db } from "./db";
import { authSecret } from "./dashboard-auth";
import { decryptSecret, encryptSecret } from "./crypto";
import { isGscPropertyShape } from "./url-guard";

// Google OAuth for Search Console - the "Connect Google Search Console"
// button (launch plan step 3). Read-only search data, except the new setup's
// Google step once GOOGLE_SETUP_SCOPES=1 (see setupScopesEnabled below).
// This flow exists so (a) the Google verification demo video can show a real
// consent screen -> data roundtrip, and (b) the future cloud onboarding can
// grow out of it. The service-account path in gsc.ts stays the default for
// self-hosters; a project that connects OAuth just gains an alternative
// credential. Server-only: never import into client components.

export const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** Read-write Search Console: the read-only scope cannot call sites.add. */
export const GSC_WRITE_SCOPE = "https://www.googleapis.com/auth/webmasters";
/** Google's Site Verification API: the token for the verification file and
 *  the "verify now" call. */
export const SITE_VERIFICATION_SCOPE = "https://www.googleapis.com/auth/siteverification";
// What the new setup's consent asks for. A new customer usually has no
// Search Console property at all, and walking them through creating and
// verifying one was the step people left on; with these two the launch job
// (job-handlers/launch.ts) drops Google's file into their repo, verifies it
// and adds the property itself. Google verified this app for the read-only
// scope only, so these stay behind a flag until it approves them; every
// other consent asks for GSC_SCOPE exactly as before. Read-only grants are
// the normal case: every helper below reads a missing scope as "not this
// grant", never as a failure.
export const SETUP_SCOPES = [GSC_WRITE_SCOPE, SITE_VERIFICATION_SCOPE];

export function setupScopesEnabled(): boolean {
  return process.env.GOOGLE_SETUP_SCOPES === "1";
}

function consentScopes(returnTo: OauthReturnTo): string[] {
  return returnTo === "onboarding" && setupScopesEnabled() ? SETUP_SCOPES : [GSC_SCOPE];
}

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

// CSRF state: HMAC-signed project slug + timestamp. Keyed by
// OAUTH_STATE_SECRET when set - the cloud deployment sets it so it can drop
// DASHBOARD_PASSWORD entirely (Supabase Auth handles login there, so the
// password's only remaining job was this signature). Falls back to
// authSecret() - the DASHBOARD_PASSWORD env or the wizard-stored password
// hash - so self-host installs need no new env var. Rotating whichever
// secret is in use invalidates in-flight OAuth states, which is fine: they
// live minutes.
const STATE_TTL_MS = 10 * 60 * 1000;

async function stateSecret(): Promise<string | null> {
  return process.env.OAUTH_STATE_SECRET || (await authSecret());
}

async function sign(payload: string): Promise<string> {
  const secret = await stateSecret();
  if (!secret) throw new Error("No OAuth state secret: set OAUTH_STATE_SECRET (or DASHBOARD_PASSWORD / claim the instance)");
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// Where the callback should land the user afterwards. An allowlisted TAG,
// never a raw URL - a URL here would be an open-redirect primitive.
// "dashboard" is the setup path's Home hero (a Google connect parked during
// onboarding and picked back up from Home).
export type OauthReturnTo = "google" | "onboarding" | "dashboard";

export async function makeState(
  projectSlug: string,
  returnTo: OauthReturnTo = "google",
): Promise<string> {
  const payload = `${projectSlug}.${returnTo}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

export async function verifyStateDetailed(
  state: string,
): Promise<{ slug: string; returnTo: OauthReturnTo } | null> {
  const lastDot = state.lastIndexOf(".");
  if (lastDot < 0) return null;
  const payload = state.slice(0, lastDot);
  const mac = state.slice(lastDot + 1);
  const expected = await sign(payload);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const parts = payload.split(".");
  // Legacy 2-part states (slug.ts) may be in flight across a deploy.
  const [slug, rawReturnTo, ts] =
    parts.length === 3 ? parts : [parts[0], "google", parts[1]];
  if (!slug || !ts || Date.now() - Number(ts) > STATE_TTL_MS) return null;
  const returnTo: OauthReturnTo =
    rawReturnTo === "onboarding" || rawReturnTo === "dashboard" ? rawReturnTo : "google";
  return { slug, returnTo };
}

export async function verifyState(state: string): Promise<string | null> {
  return (await verifyStateDetailed(state))?.slug ?? null;
}

export async function consentUrl(
  redirectUri: string,
  projectSlug: string,
  returnTo: OauthReturnTo = "google",
): Promise<string> {
  return client(redirectUri).generateAuthUrl({
    access_type: "offline", // refresh token, so the connection survives
    prompt: "consent", // force the consent screen even on re-connect (demo video needs it)
    scope: consentScopes(returnTo),
    state: await makeState(projectSlug, returnTo),
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
      .update({ gsc_oauth_refresh_token: await encryptSecret(tokens.refresh_token) })
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

// Correct the tracked Search Console property. Onboarding GUESSES
// `sc-domain:<domain>`, but plenty of real properties are URL-prefix
// ("https://example.com/") - a wrong guess used to leave "waiting for the
// service account" stuck forever with no code path able to fix it. Both the
// dashboard's "use this property" button and the set_gsc_property MCP tool
// land here.
export async function setTrackedProperty(
  projectId: string,
  siteUrl: string,
): Promise<string | null> {
  // The one chokepoint for a tenant-writable column, so the shape check lives
  // here rather than in each of its three doors (the /google picker, the
  // wizard, the set_gsc_property MCP tool). Google names properties in exactly
  // two forms; anything else is a typo, or an attempt to park arbitrary text -
  // including an internal address - in a value other code paths hand to an API
  // client. isGscPropertyShape also refuses private/loopback hosts.
  const trimmed = siteUrl.trim();
  if (!isGscPropertyShape(trimmed)) {
    return "That doesn't look like a Search Console property. Use the exact string Search Console shows - either `sc-domain:example.com` or `https://example.com/`.";
  }
  const { error } = await db()
    .from("projects")
    .update({ gsc_site_url: trimmed })
    .eq("id", projectId);
  return error ? error.message : null;
}

async function refreshClient(refreshTokenEncrypted: string) {
  const auth = client("postmessage"); // redirect uri unused for refresh flows
  auth.setCredentials({ refresh_token: await decryptSecret(refreshTokenEncrypted) });
  return auth;
}

export async function oauthSearchConsole(refreshTokenEncrypted: string) {
  return google.searchconsole({ version: "v1", auth: await refreshClient(refreshTokenEncrypted), timeout: 25000 });
}

/** Google refusing a call because the grant lacks its scope (an old,
 *  read-only grant), as opposed to the call itself failing. */
export function isScopeError(e: unknown): boolean {
  const err = e as { status?: number; code?: number | string; message?: string; response?: { status?: number } } | null;
  const status = Number(err?.response?.status ?? err?.status ?? err?.code);
  return status === 403 && /insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(String(err?.message ?? ""));
}

/** Does this grant carry the setup's write scopes? Asked before any write
 *  call, so a read-only grant (the normal case while GOOGLE_SETUP_SCOPES is
 *  off) never even tries one. */
export async function grantHasSetupScopes(refreshTokenEncrypted: string): Promise<boolean> {
  const auth = await refreshClient(refreshTokenEncrypted);
  const { token } = await auth.getAccessToken();
  if (!token) return false;
  const info = await auth.getTokenInfo(token);
  return SETUP_SCOPES.every((s) => info.scopes.includes(s));
}

/** The verification file Google wants at `siteUrl` (a URL-prefix property,
 *  "https://example.com/"): its name, which is also its content's token.
 *  Null when this grant predates the verification scope. */
export async function siteVerificationFileToken(refreshTokenEncrypted: string, siteUrl: string): Promise<string | null> {
  const api = google.siteVerification({ version: "v1", auth: await refreshClient(refreshTokenEncrypted), timeout: 25000 });
  try {
    const res = await api.webResource.getToken({
      requestBody: { verificationMethod: "FILE", site: { type: "SITE", identifier: siteUrl } },
    });
    return res.data.token ?? null;
  } catch (e) {
    if (isScopeError(e)) return null;
    throw e;
  }
}

/** The body Google expects in the verification file. */
export function siteVerificationFileBody(token: string): string {
  return `google-site-verification: ${token}`;
}

/** Ask Google to check the file now. Throws when it can't see it yet. */
export async function confirmSiteVerification(refreshTokenEncrypted: string, siteUrl: string): Promise<void> {
  const api = google.siteVerification({ version: "v1", auth: await refreshClient(refreshTokenEncrypted), timeout: 25000 });
  await api.webResource.insert({
    verificationMethod: "FILE",
    requestBody: { site: { type: "SITE", identifier: siteUrl } },
  });
}

/** Add a verified site to the account's Search Console. False when the
 *  grant is read-only and cannot add properties. */
export async function addSearchConsoleSite(refreshTokenEncrypted: string, siteUrl: string): Promise<boolean> {
  try {
    await (await oauthSearchConsole(refreshTokenEncrypted)).sites.add({ siteUrl });
    return true;
  } catch (e) {
    if (isScopeError(e)) return false;
    throw e;
  }
}

// The connected Google account's Search Console properties.
export async function oauthListSites(
  refreshTokenEncrypted: string,
): Promise<Array<{ siteUrl: string; permissionLevel: string }>> {
  const res = await (await oauthSearchConsole(refreshTokenEncrypted)).sites.list();
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
  const res = await (await oauthSearchConsole(refreshTokenEncrypted)).searchanalytics.query({
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
