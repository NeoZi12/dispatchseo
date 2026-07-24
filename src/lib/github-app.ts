import { createSign, createHmac, timingSafeEqual } from "node:crypto";
import { makeState } from "./gsc-oauth";
import { authSecret } from "./dashboard-auth";

// GitHub App auth core - JWT signing, installation token exchange, and the
// install URL the "Connect GitHub" button links to. Plain fetch, no octokit,
// same posture as github.ts (the classic PAT-based helpers this App is
// eventually meant to replace). This module is auth plumbing ONLY: nothing
// here calls a repo endpoint on behalf of a project yet - wiring an
// installation token into github.ts's PR/dispatch calls, webhook handling,
// and per-project secret storage are later steps.
//
// Two credentials, two lifetimes:
//   - the App's own JWT (appJwt) - proves "I am this App", ~10min max
//     lifetime per GitHub's rules, used only to mint installation tokens and
//     read installation metadata.
//   - a per-installation access token (installationToken) - proves "I am
//     this App, acting on THIS install's repos", ~1hr lifetime, used for any
//     actual repo API call (see listInstallationRepos).

const API = "https://api.github.com";
const USER_AGENT = "dispatchseo-app";

// ---- install nonce (anti-race for no-state github.com installs) -------------
// A bare "Install" from github.com/apps/... redirects to our Setup URL with an
// installation_id but NO signed state, so the callback can't prove who did it.
// installation_id is a small, enumerable integer, so without more, a signed-in
// attacker could guess a victim's fresh install and bind it to their OWN
// project via attachGithubInstallation. The callback drops this HMAC nonce as
// an httpOnly cookie in the INSTALLER's browser; attach requires it back,
// proving the same browser received GitHub's redirect for THIS installation.
// State-carrying installs (our Connect button) never hit this path - they
// attach in the callback off a signed project slug.
const INSTALL_NONCE_TTL_MS = 15 * 60 * 1000;

async function installNonceSecret(): Promise<string> {
  const s = process.env.OAUTH_STATE_SECRET || (await authSecret());
  if (!s) throw new Error("No signing secret for the GitHub install nonce (set OAUTH_STATE_SECRET).");
  return s;
}

export async function makeInstallNonce(installationId: number): Promise<string> {
  const payload = `${installationId}.${Date.now()}`;
  const mac = createHmac("sha256", await installNonceSecret()).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export async function verifyInstallNonce(nonce: string, installationId: number): Promise<boolean> {
  const parts = nonce.split(".");
  if (parts.length !== 3) return false;
  const [id, ts, mac] = parts;
  if (id !== String(installationId)) return false;
  if (!/^\d+$/.test(ts) || Date.now() - Number(ts) > INSTALL_NONCE_TTL_MS) return false;
  const expected = createHmac("sha256", await installNonceSecret()).update(`${id}.${ts}`).digest("hex");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function base64url(input: string | Buffer): string {
  return (Buffer.isBuffer(input) ? input : Buffer.from(input)).toString("base64url");
}

function ghHeaders(bearer: string): Record<string, string> {
  return {
    Authorization: `Bearer ${bearer}`,
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
  };
}

// Vercel env vars paste as a single line, so a multi-line PEM is commonly
// stored with real newlines escaped as literal "\n" - convert back to real
// newlines when that's how it arrived; a PEM already containing real
// newlines (local dev, some hosts) is returned untouched.
export function appPrivateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

let jwtCache: { token: string; exp: number } | null = null;

// RS256 JWT identifying the App itself (GitHub's app-level auth - see
// https://docs.github.com/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app).
// Cached until ~60s before its own expiry so every call in that window reuses
// one signature instead of re-signing per request.
export function appJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwtCache && now < jwtCache.exp - 60) return jwtCache.token;

  const iat = now - 60; // backdated a minute to tolerate clock drift with GitHub's server
  const exp = now + 9 * 60; // GitHub caps this at 10min; 9 leaves headroom
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat, exp, iss: process.env.GITHUB_APP_ID };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = base64url(signer.sign(appPrivateKey()));

  const token = `${signingInput}.${signature}`;
  jwtCache = { token, exp };
  return token;
}

const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();

export function bustInstallationTokenCache(installationId: number): void {
  installationTokenCache.delete(installationId);
}

// A short-lived token scoped to one installation's repos - what every actual
// repo API call authenticates with (never the App JWT itself). Cached per
// installation with 5min headroom before GitHub's own expires_at, so a call
// landing right at the edge doesn't get handed a token that expires mid-flight.
export async function installationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && Date.now() < cached.expiresAt - 5 * 60 * 1000) return cached.token;

  const res = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: ghHeaders(appJwt()),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    throw new Error(`GitHub installation token request failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { token: string; expires_at: string };
  const expiresAt = new Date(body.expires_at).getTime();
  installationTokenCache.set(installationId, { token: body.token, expiresAt });
  return body.token;
}

// Confirms a caller-supplied installation id is actually one of OUR App's
// installations, not some other app/org's id. This matters because
// installation_id always arrives as an unauthenticated query param on the
// install callback - without this check, anyone could point that route at
// an arbitrary id and get it wired into their project. null covers "not
// ours" (404) as well as any other non-2xx GitHub response.
export async function getInstallation(
  installationId: number,
): Promise<{ account_login: string } | null> {
  const res = await fetch(`${API}/app/installations/${installationId}`, {
    headers: ghHeaders(appJwt()),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { account?: { login?: string } };
  return { account_login: body.account?.login ?? "" };
}

// Every repo the installation can see, paginated to total_count. Used right
// after install to decide whether the flow can auto-attach a single repo or
// must ask the owner to pick one.
export async function listInstallationRepos(
  installationId: number,
): Promise<Array<{ full_name: string; private: boolean }>> {
  const token = await installationToken(installationId);
  const repos: Array<{ full_name: string; private: boolean }> = [];
  let page = 1;
  let totalCount = Infinity;

  while (repos.length < totalCount) {
    const res = await fetch(`${API}/installation/repositories?per_page=100&page=${page}`, {
      headers: ghHeaders(token),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`GitHub installation repositories request failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      total_count: number;
      repositories: Array<{ full_name: string; private: boolean }>;
    };
    totalCount = body.total_count;
    repos.push(...body.repositories.map((r) => ({ full_name: r.full_name, private: r.private })));
    if (body.repositories.length === 0) break; // guard against a stuck loop on a bad total_count
    page += 1;
  }
  return repos;
}

// Where the dashboard's "Connect GitHub" button sends the owner. state ties
// the eventual callback back to the project that started the flow (signed
// the same way the GSC OAuth flow does - see gsc-oauth.ts).
export async function installUrl(projectSlug: string): Promise<string> {
  const state = await makeState(projectSlug);
  return `https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;
}
