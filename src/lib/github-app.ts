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
): Promise<{ account_login: string; updated_at: string | null; suspended: boolean } | null> {
  const res = await fetch(`${API}/app/installations/${installationId}`, {
    headers: ghHeaders(appJwt()),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    account?: { login?: string };
    updated_at?: string;
    suspended_at?: string | null;
  };
  return {
    account_login: body.account?.login ?? "",
    updated_at: body.updated_at ?? null,
    suspended: Boolean(body.suspended_at),
  };
}

// How recently GitHub must have touched an installation for us to accept a
// claim on it. The install/update redirect lands within seconds; a human
// picking a project on the interrupt screen takes a minute or two.
const CLAIM_FRESHNESS_MS = 15 * 60_000;

// Defense in depth against installation-claim hijacking.
//
// GitHub's setup redirect is UNSIGNED: `installation_id` arrives as a bare
// integer in the query string, and nothing in it proves the browser redeeming
// it is the account that performed the install. Project ownership is checked,
// but that only proves the caller owns the project they are writing INTO -
// never that they control the installation they are writing IN. So a signed-in
// customer who learns a live installation id can bind it to their own project,
// then have our App commit files, write Actions secrets, and dispatch workflows
// in someone else's repository.
//
// The complete fix is user-to-server OAuth during install (tick "Request user
// authorization (OAuth) during installation" on the App, then verify the id
// appears in the caller's own GET /user/installations). That needs App-level
// configuration and new secrets, so it is deliberately NOT what this is.
//
// What this does close, cheaply and with no configuration: every case where the
// id is a claimable ORPHAN rather than a live race. An installation goes orphan
// whenever our webhook NULLs github_installation_id but the installation stays
// alive on GitHub - suspension, a repo removed from the installation, an
// abandoned install that never finished the wizard. Those sit claimable
// indefinitely, and they are what makes a scan worth running. Requiring GitHub
// to have touched the installation seconds ago collapses the exposure to the
// few minutes around a real, in-progress install.
export function installationClaimable(inst: {
  updated_at: string | null;
  suspended: boolean;
}): boolean {
  if (inst.suspended) return false;
  if (!inst.updated_at) return false; // no timestamp = cannot prove freshness
  const age = Date.now() - new Date(inst.updated_at).getTime();
  return Number.isFinite(age) && age >= 0 && age <= CLAIM_FRESHNESS_MS;
}

// ---- proof that the CALLER controls the installation ------------------------
//
// This is the real boundary the freshness heuristic above only narrows.
// GitHub's setup redirect carries installation_id as a bare integer and proves
// nothing about who performed the install, so ownership of the project being
// written INTO was the only thing ever checked - never control of the
// installation being written IN. With "Request user authorization (OAuth)
// during installation" enabled on the App, GitHub also sends a short-lived
// `code`. Exchanging it yields a token for the HUMAN who just clicked Install,
// and GET /user/installations lists exactly the installations that human can
// administer. If the id is not in that list, the caller does not control it.
//
// Fails CLOSED on anything unexpected - a network error, a rejected exchange, a
// malformed response. An authorization check that degrades to "allow" under
// load is not a check.
export function userAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_APP_CLIENT_ID && process.env.GITHUB_APP_CLIENT_SECRET);
}

// Whether a MISSING ?code should refuse the install outright.
//
// A present-but-invalid code is always refused - that is evidence about the
// caller and needs no opt-in. A missing code is the ambiguous case: it means
// GitHub's redirect did not carry one, which is more often our own App
// configuration than an attacker stripping a parameter.
//
// History: on launch morning (2026-07-28) failing closed on a missing code
// blocked every legitimate install, so enforcement became an operator opt-in
// (GITHUB_APP_REQUIRE_INSTALL_PROOF=1) while the callback leaned on the
// freshness / suspension gate. That was the operator's documented choice, not a
// silent downgrade.
//
// The default is now strict: whenever the App's client credentials are
// configured (userAuthConfigured), a missing code is refused. Setting
// GITHUB_APP_REQUIRE_INSTALL_PROOF=0 is the explicit relax switch that falls
// back to the freshness gate - an operator decision that has to be written
// down, never the state a deploy lands in by omission.
export function requireInstallProof(): boolean {
  return userAuthConfigured() && process.env.GITHUB_APP_REQUIRE_INSTALL_PROOF !== "0";
}

export async function callerControlsInstallation(
  code: string,
  installationId: number,
): Promise<boolean> {
  if (!code) return false;
  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_APP_CLIENT_ID,
        client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
        code,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!tokenRes.ok) {
      console.error(`[github-install] code exchange HTTP ${tokenRes.status}`);
      return false;
    }
    // GitHub answers 200 with {error: "bad_verification_code"} on a spent or
    // forged code, so the status alone proves nothing.
    const token = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (!token.access_token) {
      // GitHub answers 200 with {error} on a spent/forged code or bad creds -
      // naming it here is the difference between "someone tried something" and
      // "our client id/secret is wrong", which look identical from outside.
      console.error(`[github-install] code exchange returned no token: ${token.error ?? "unknown"}`);
      return false;
    }

    // Paginate: an account can administer more installations than one page.
    for (let page = 1; page <= 5; page++) {
      const res = await fetch(`${API}/user/installations?per_page=100&page=${page}`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/vnd.github+json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        console.error(`[github-install] /user/installations HTTP ${res.status}`);
        return false;
      }
      const body = (await res.json()) as { installations?: Array<{ id?: number }> };
      const list = body.installations ?? [];
      if (list.some((i) => i.id === installationId)) return canWriteThroughInstallation(token.access_token, installationId);
      if (list.length < 100) {
        console.error(
          `[github-install] installation ${installationId} not in the installer's own list ` +
            `(saw ${list.length} on page ${page})`,
        );
        return false; // last page, not found
      }
    }
    return false;
  } catch {
    return false;
  }
}

// "In the installer's list" also holds for an organization member who can
// only READ a repo the App is installed on: GitHub lists every installation
// the user can see. Binding it to their DispatchSEO site would then open (and
// on Auto, merge) pull requests in repos they cannot push to themselves. So
// the caller must be able to push to at least one repo the installation
// covers - true of anyone who installed the App or administers its repos.
//
// Refuses ONLY on positive evidence: repos were listed, each with the
// caller's permissions, and none allows push. Anything else (GitHub
// unreachable, an unexpected shape, an installation with no repos yet) keeps
// the answer the list gave - a legitimate install must never be blocked by
// this second look (launch morning, 2026-07-28).
async function canWriteThroughInstallation(userToken: string, installationId: number): Promise<boolean> {
  try {
    let seen = 0;
    for (let page = 1; page <= 3; page++) {
      const res = await fetch(`${API}/user/installations/${installationId}/repositories?per_page=100&page=${page}`, {
        headers: {
          Authorization: `Bearer ${userToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return true;
      const body = (await res.json()) as { repositories?: Array<{ permissions?: { admin?: boolean; push?: boolean; maintain?: boolean } | null }> };
      const repos = body.repositories;
      if (!Array.isArray(repos)) return true;
      for (const r of repos) {
        if (!r?.permissions || typeof r.permissions !== "object") return true; // shape we cannot judge
        if (r.permissions.admin || r.permissions.push || r.permissions.maintain) return true;
      }
      seen += repos.length;
      if (repos.length < 100) break;
      if (page === 3) return true; // more repos than we read: not proven
    }
    if (seen === 0) return true;
    console.error(`[github-install] installation ${installationId}: the caller can read ${seen} repo(s) through it and push to none - refused`);
    return false;
  } catch {
    return true;
  }
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
