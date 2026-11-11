// The second publishing route. DispatchSEO's first (and until now only) way
// to land an article was a GitHub pull request - fine for a code-built site,
// impossible to explain to an owner who has never opened a terminal. Two paid
// WordPress trials died at exactly that step ("Connect GitHub") in 2026-08.
// This module is the fix: it talks to a self-hosted WordPress site over its
// own HTTP connection using an Application Password the owner copy-pastes
// from their own Users screen. No plugin to install, no OAuth app to approve
// - just a username and a password WordPress itself generates.
//
// Two mechanical decisions here are deliberate and NOT bugs to "fix" later:
//
// 1. We never create a post with status:"future". WordPress's own scheduler
//    (WP-Cron) only runs when a visitor loads a page, so a scheduled post on
//    a low-traffic site can sit unpublished long past its scheduled time -
//    WordPress's own documentation gives a 2pm-scheduled / 5pm-actually-live
//    example. Every post this module creates is a draft; DispatchSEO's own
//    cron calls publishPost() at the moment the owner actually wants it live.
//    If you are looking at this because a post published "late," the bug is
//    in the cron's timing, not here - do not reintroduce status:"future".
//
// 2. We never touch _elementor_data, or anything else Elementor-specific.
//    Elementor has said publicly there is no supported way to write their
//    page-builder data from outside the editor. A post created through the
//    plain `content` field renders fine through the theme's (or Elementor
//    Pro's) normal single-post template - it just isn't an Elementor-built
//    layout, which is the correct and only safe outcome here.
//
// Credentials (WordPressCredentials) arrive already decrypted - the caller
// owns src/lib/crypto.ts. Nothing in this module writes a password to a log,
// an error, or a returned message; every failure is described with our own
// fixed English sentences, never by echoing back what was sent.
//
// Every outbound call goes through wpFetch(), which mirrors the SSRF guard
// in src/lib/site-platform.ts: HTTPS is required, the host is checked against
// isPrivateHost() on the starting URL AND on every redirect hop (redirects are
// followed by hand, never with fetch's redirect:"follow"), every read is
// capped, and every call carries a timeout.

import { fetch as pinnedFetch } from "undici";
import { isPrivateHost } from "./url-guard";
import { pinnedAgent } from "./writer/fetch";

export type WordPressCredentials = {
  url: string;
  username: string;
  applicationPassword: string;
};

// Machine-readable outcome for every failure this module can produce. A
// dashboard or an MCP tool can switch on this without parsing English; the
// `message` next to it is what the owner actually reads.
export type WordPressFailReason =
  | "invalid_url"
  | "requires_https"
  | "unreachable"
  | "redirect_loop"
  | "route_not_found"
  | "blocked_by_security"
  | "unexpected_response"
  | "rest_api_not_found"
  | "invalid_username"
  | "invalid_email"
  | "invalid_password"
  | "app_passwords_disabled"
  | "app_passwords_disabled_for_user"
  | "auth_failed"
  | "insufficient_role"
  | "cannot_create_posts"
  | "upload_failed"
  | "wordpress_error";

// `body` carries WordPress's own parsed error payload when there was one. It
// exists so a caller can act on structured detail the English sentence throws
// away - resolveTerms() reads data.term_id out of a "term_exists" race here -
// without anyone being tempted to parse `message`. Optional and always last:
// nothing is required to look at it.
type WordPressFailure = {
  ok: false;
  reason: WordPressFailReason;
  message: string;
  body?: unknown;
};

export type WordPressCapabilities = {
  edit_posts: boolean;
  publish_posts: boolean;
  upload_files: boolean;
  edit_others_posts: boolean;
};

export type ConnectResult =
  | {
      ok: true;
      siteName: string;
      userId: number;
      roles: string[];
      capabilities: WordPressCapabilities;
      seoPlugin: "yoast" | "rankmath" | "seopress" | null;
      canPublish: boolean;
      canUploadMedia: boolean;
    }
  | WordPressFailure;

export type MediaInput = {
  bytes: Uint8Array | ArrayBuffer;
  filename: string;
  mimeType: string;
  altText?: string;
};

export type MediaResult = { ok: true; id: number; url: string } | WordPressFailure;

export type PostDraftInput = {
  title: string;
  /** Rendered HTML - becomes the post's `content`. */
  html: string;
  slug?: string;
  /** Used as WordPress's `excerpt` field; this is also where a meta
   *  description belongs for most SEO plugins, which read the excerpt when
   *  no explicit meta description is set. */
  excerpt?: string;
  /** Category/tag NAMES, not ids - resolveTerms() is called internally to
   *  turn them into the term ids WordPress's `categories`/`tags` fields
   *  require (it accepts only integers, never names). */
  categories?: string[];
  tags?: string[];
  featuredMediaId?: number;
};

export type PostResult =
  | { ok: true; id: number; slug: string; link: string; status: string }
  | WordPressFailure;

export type PublishResult = { ok: true; link: string; slug: string } | WordPressFailure;

// --- User-facing copy -----------------------------------------------------
//
// Centralized so wpFetch() and connectWordPress() (which pre-checks HTTPS and
// the private-host guard itself, before spending a network call) never drift
// apart on wording. Every sentence here assumes the reader has never heard
// the words "REST," "endpoint," or "OAuth" - because they haven't.

const INVALID_URL_MSG =
  "That doesn't look like a working website address. Double-check it (it should look like https://yoursite.com) and try again.";
const PRIVATE_HOST_MSG =
  "That address points to a private or local network location, not a real public website, so we can't connect to it.";
const REQUIRES_HTTPS_MSG =
  "Your website address needs to start with https:// (a secure connection) for WordPress passwords to work. Ask your host to add an SSL certificate (most hosts do this for free), or check that you typed https:// and not http://.";
const UNREACHABLE_MSG =
  "We could not reach your website. Check that the address is correct, the site is online, and nothing (like a firewall) is blocking outside connections to it.";
const REDIRECT_LOOP_MSG =
  "Your website kept redirecting us before we could reach it. Check that your site's address, and its https:// setup, is configured correctly.";
const CROSS_ORIGIN_REDIRECT_MSG =
  "Your website tried to send us to a different web address than the one you gave us, so we stopped. We will not send your WordPress password anywhere except your own site. Check the address you entered - if your site has moved, enter its new address instead.";
const PERMALINKS_MSG =
  "Your website answered, but not at the address WordPress normally uses to receive posts. This is almost always caused by 'pretty permalinks' being turned off. In WordPress, go to Settings, then Permalinks, and click Save (you don't need to change anything) - then try again.";
const BLOCKED_MSG =
  "Something on your website blocked this connection before WordPress itself could respond - usually a security plugin (like Wordfence or iThemes Security) or a setting at your hosting company. Look in your security plugin for an option to allow application-password connections, or ask your host to allow them.";
const WP_API_NOT_FOUND_MSG =
  "We reached your website, but could not find WordPress's connection point on it. Either this is not a WordPress site, or a plugin has turned off outside connections to it.";
const AUTH_FAILED_MSG =
  "We could not sign in to WordPress with that username and application password. Double-check both, and make sure the entire application password was copied, including the spaces.";
const GENERIC_403_MSG =
  "The connected WordPress user does not have permission to do this. In WordPress, go to Users, edit that user, and change their role to Editor (or Author, if they only need to work on their own posts).";

function unexpectedResponseMsg(status: number): string {
  return `Your website sent back a response we did not expect (status ${status}). This can happen with certain hosting firewalls - wait a minute and try again, or contact your host if it keeps happening.`;
}

function capabilityMessage(code: string): string {
  const action = code.includes("publish")
    ? "publish posts"
    : code.includes("edit")
      ? "edit posts"
      : code.includes("delete")
        ? "delete posts"
        : code.includes("create")
          ? "create posts"
          : "do that";
  return `The connected WordPress user does not have permission to ${action}. In WordPress, go to Users, edit that user, and change their role to Editor (or Author, if they only need to work on their own posts).`;
}

// --- Low-level transport ---------------------------------------------------

const TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 30_000;
// Larger than the 400KB cap in site-platform.ts on purpose: a plugin-heavy
// WordPress site's /wp-json/ root inlines the full route schema for every
// registered plugin and can run to several hundred KB before the namespaces
// array (the only part we read) even closes. A tighter cap truncated that
// array mid-parse and reported a perfectly healthy site as unreachable - the
// exact bug site-platform.ts's probeWpJson() carries a comment about
// (grimoakademija.lt, 2026-08-18). Every other response we read here (a
// single post, a single media item, a short list of terms) is tiny, so 2MB
// costs nothing in the common case and only matters for that one call.
const MAX_BODY_BYTES = 2_000_000;
const MAX_REDIRECTS = 4;
const MAX_UPLOAD_BYTES = 20_000_000;

const UA = "Mozilla/5.0 (compatible; DispatchSEO-Publisher/1.0; +https://dispatchseo.com/docs/wordpress)";

type WpFetchOpts = {
  method?: "GET" | "POST" | "DELETE";
  json?: unknown;
  rawBody?: { bytes: Uint8Array; contentType: string; contentDisposition: string };
};

type WpFetchResult = { ok: true; status: number; body: unknown } | WordPressFailure;

function fail(reason: WordPressFailReason, message: string): WordPressFailure {
  return { ok: false, reason, message };
}

/** Strip control characters a header value must never carry (CR/LF header
 *  injection, mostly). Filenames and mime types both pass through this. */
function sanitizeHeaderValue(v: string): string {
  return v.replace(/[\r\n]/g, "").trim();
}

function sanitizeFilename(name: string): string {
  const base = sanitizeHeaderValue(name).split(/[\\/]/).pop() || "upload";
  const cleaned = base.replace(/[^\w.-]+/g, "_").slice(0, 150);
  return cleaned || "upload";
}

/** Read at most MAX_BODY_BYTES of the body as text, so a huge or hostile
 *  response can never be read fully into memory. Mirrors the same pattern in
 *  site-platform.ts's readCapped - kept as a local copy since that one isn't
 *  exported, and this module has its own (larger) cap for its own reason. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return await res.text().catch(() => "");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
        if (total >= MAX_BODY_BYTES) break;
      }
    }
  } catch {
    // Partial body is still worth trying to parse as JSON.
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
  }
  const cap = Math.min(total, MAX_BODY_BYTES);
  const merged = new Uint8Array(cap);
  let at = 0;
  for (const c of chunks) {
    const room = cap - at;
    if (room <= 0) break;
    merged.set(c.subarray(0, Math.min(c.length, room)), at);
    at += Math.min(c.length, room);
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

// WordPress's error body shape is the same for every failure:
//   { code, message, data: { status }, additional_errors?: [...] }
// `data.status` (not the HTTP status) is what actually distinguishes a
// capability failure (403 - signed in fine, missing role) from an auth
// failure (401 - Basic auth itself failed), because the SAME code
// (rest_cannot_create, rest_cannot_edit, rest_cannot_publish_posts, ...) is
// used for both. We branch on status, never on code alone, for that family.
/**
 * WordPress's own error text, made safe to show an owner.
 *
 * The text is worth showing: when a security plugin or a host refuses a write,
 * its sentence usually names the actual cause, and this repo's rule is to name
 * what happened rather than emit a shrug. But it arrives as whatever some
 * plugin author wrote - core and plugins both put HTML in these strings
 * (`<code>`, `<a href>`, `<strong>`), and a PHP notice can run to kilobytes.
 * So: strip tags, decode the handful of entities WordPress emits, collapse
 * whitespace, and cap the length. Never pass it through raw.
 */
function siteSaid(raw: string | null): string | null {
  if (!raw) return null;
  const clean = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&(amp|lt|gt|quot|#0?39|apos|nbsp);/gi, (_m, e: string) => {
      const map: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      return map[e.toLowerCase()] ?? (e.startsWith("#") ? "'" : " ");
    })
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return null;
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function classifyWpError(parsed: unknown, httpStatus: number): { reason: WordPressFailReason; message: string } {
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const code = typeof obj.code === "string" ? obj.code : null;
  const msg = siteSaid(typeof obj.message === "string" ? obj.message : null);
  const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {};
  const status = typeof data.status === "number" ? data.status : httpStatus;

  switch (code) {
    case "invalid_username":
      return {
        reason: "invalid_username",
        message:
          "We could not find a WordPress user with that username. Enter the username you log in with (not your email address or display name), then try again.",
      };
    case "invalid_email":
      return {
        reason: "invalid_email",
        message:
          "We could not find a WordPress user with that email address. Enter the username you use to log in to WordPress instead, then try again.",
      };
    case "incorrect_password":
      return {
        reason: "invalid_password",
        message:
          "That application password isn't valid. In WordPress, go to Users, then your profile, scroll to Application Passwords, create a brand new one, and paste the entire thing here (including the spaces).",
      };
    case "application_passwords_disabled":
      return {
        reason: "app_passwords_disabled",
        message:
          "Application passwords are turned off for this entire WordPress site. Ask whoever manages the site to turn them on, or - if the site is older - install the free 'Application Passwords' plugin.",
      };
    case "application_passwords_disabled_for_user":
      return {
        reason: "app_passwords_disabled_for_user",
        message:
          "Application passwords are turned off for this specific WordPress user. Ask whoever manages the site to turn them on for this user, or connect with a different user account.",
      };
    case "rest_no_route":
      return { reason: "route_not_found", message: PERMALINKS_MSG };
  }

  if (code && code.startsWith("rest_upload_")) {
    return {
      reason: "upload_failed",
      message: `WordPress could not accept the image. This is usually temporary - try again in a minute.${msg ? ` Your site said: "${msg}"` : ""}`,
    };
  }

  if (code && code.startsWith("rest_cannot_")) {
    if (status === 401) return { reason: "auth_failed", message: AUTH_FAILED_MSG };
    return { reason: "insufficient_role", message: capabilityMessage(code) };
  }

  if (status === 401) return { reason: "auth_failed", message: AUTH_FAILED_MSG };
  if (status === 403) {
    return {
      reason: "insufficient_role",
      message: msg ? `${GENERIC_403_MSG} Your site said: "${msg}"` : GENERIC_403_MSG,
    };
  }
  if (status === 404) return { reason: "route_not_found", message: PERMALINKS_MSG };

  return {
    reason: "wordpress_error",
    message: msg
      ? `Your website refused the change and said: "${msg}"`
      : `Your website refused the change without saying why (code ${status}). Try again, and if it keeps happening, send us that number.`,
  };
}

/**
 * Every public function in this module goes through this. It builds the
 * request, attaches Basic auth, guards against SSRF the same way
 * site-platform.ts's guardedFetch does (HTTPS + isPrivateHost, re-checked on
 * every redirect hop, redirects followed by hand rather than via
 * redirect:"follow"), caps how much of the response it will ever read, and
 * turns whatever came back - valid JSON error, a themed 404 page, a bare HTML
 * firewall block with no JSON at all - into one of the named failures above.
 * Never throws; every failure mode is a returned value.
 */
async function wpFetch(creds: WordPressCredentials, path: string, opts: WpFetchOpts = {}): Promise<WpFetchResult> {
  let start: URL;
  try {
    start = new URL(creds.url);
  } catch {
    return fail("invalid_url", INVALID_URL_MSG);
  }
  if (start.protocol !== "https:") return fail("requires_https", REQUIRES_HTTPS_MSG);
  if (isPrivateHost(start.hostname)) return fail("invalid_url", PRIVATE_HOST_MSG);

  // Request paths are joined UNDER any path the site URL carries, because a
  // WordPress install commonly lives in a subdirectory (https://site.com/blog
  // -> https://site.com/blog/wp-json/...). Resolving "/wp-json/" against the
  // bare origin instead once made every subdirectory install unreachable.
  const basePath = start.pathname.replace(/\/+$/, "");
  let target: string;
  try {
    target = new URL(`${basePath}${path}`, start.origin).toString();
  } catch {
    return fail("invalid_url", INVALID_URL_MSG);
  }

  const username = creds.username.trim();
  // WordPress strips whitespace from the password itself before comparing,
  // so the 4-char-grouped form it displays ("abcd efgh ijkl mnop") would work
  // as-is - but stripping it ourselves before encoding keeps the header
  // clean regardless of what the caller passed through.
  const password = creds.applicationPassword.replace(/\s+/g, "");
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`, "utf8").toString("base64");

  const headers: Record<string, string> = {
    "user-agent": UA,
    accept: "application/json",
    authorization: authHeader,
  };
  let requestBody: string | Uint8Array | undefined;
  const method = opts.method ?? (opts.json !== undefined || opts.rawBody ? "POST" : "GET");
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    requestBody = JSON.stringify(opts.json);
  } else if (opts.rawBody) {
    headers["content-type"] = sanitizeHeaderValue(opts.rawBody.contentType);
    headers["content-disposition"] = sanitizeHeaderValue(opts.rawBody.contentDisposition);
    requestBody = new Uint8Array(opts.rawBody.bytes);
  }
  const timeoutMs = opts.rawBody ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS;

  let final: { res: Response } | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let hopUrl: URL;
    try {
      hopUrl = new URL(target);
    } catch {
      return fail("invalid_url", INVALID_URL_MSG);
    }
    if (hopUrl.protocol !== "https:") return fail("requires_https", REQUIRES_HTTPS_MSG);
    if (isPrivateHost(hopUrl.hostname)) return fail("invalid_url", PRIVATE_HOST_MSG);

    let res: Response;
    try {
      // Pinned DNS on every hop: isPrivateHost is lexical, the agent's lookup
      // refuses a name that RESOLVES private (writer/fetch.ts).
      res = (await pinnedFetch(target, {
        dispatcher: pinnedAgent,
        method,
        redirect: "manual",
        headers,
        // Only the first hop sends the body. WordPress's own API never
        // redirects a write in normal operation (this exists purely as a
        // defensive fallback for a misconfigured http->https redirect on the
        // site itself); re-sending a request body to a location we have not
        // yet re-validated is not a case worth supporting.
        body: hop === 0 ? requestBody : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      })) as unknown as Response;
    } catch {
      return fail("unreachable", UNREACHABLE_MSG);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        final = { res };
        break;
      }
      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        return fail("invalid_url", INVALID_URL_MSG);
      }
      // CROSS-ORIGIN REDIRECTS ARE REFUSED, and this is a security boundary,
      // not a nicety. `headers` carries the Basic auth header built from the
      // owner's WordPress application password, and it is sent on every hop.
      // isPrivateHost only rejects internal addresses, so without this check a
      // site that answers 302 to https://someone-elses-host/ would be handed a
      // live credential for the customer's WordPress - by us, over TLS, with
      // no way for them to know. A legitimate WordPress REST call never
      // redirects to another origin; the only redirects worth following are the
      // site's own http->https and trailing-slash normalisations, which stay on
      // the same origin and are still allowed below.
      if (next.origin !== hopUrl.origin) {
        return fail("blocked_by_security", CROSS_ORIGIN_REDIRECT_MSG);
      }
      target = next.toString();
      continue;
    }
    final = { res };
    break;
  }
  if (!final) return fail("redirect_loop", REDIRECT_LOOP_MSG);

  const res = final.res;
  const text = await readCapped(res);
  let parsed: unknown = null;
  let isJson = true;
  try {
    parsed = JSON.parse(text);
  } catch {
    isJson = false;
  }

  if (!isJson) {
    // No JSON body at all is exactly the shape a server/WAF-level block
    // takes - it never reached WordPress's own error handling. A 404 with no
    // JSON almost always means broken permalinks (same underlying fix as the
    // JSON rest_no_route case); a 401/403 with no JSON is a firewall or
    // security plugin, not WordPress itself, so it gets a different, more
    // actionable message than "wrong password."
    if (res.status === 404) return fail("route_not_found", PERMALINKS_MSG);
    if (res.status === 401 || res.status === 403) return fail("blocked_by_security", BLOCKED_MSG);
    return fail("unexpected_response", unexpectedResponseMsg(res.status));
  }

  if (res.ok) return { ok: true, status: res.status, body: parsed };

  const { reason, message } = classifyWpError(parsed, res.status);
  return { ...fail(reason, message), body: parsed };
}

// --- Small shape helpers -----------------------------------------------

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function extractNamespaces(body: unknown): string[] {
  const ns = asRecord(body).namespaces;
  return Array.isArray(ns) ? ns.filter((n): n is string => typeof n === "string") : [];
}

function extractSiteName(body: unknown): string | null {
  const name = asRecord(body).name;
  return typeof name === "string" && name.trim() ? name : null;
}

function termId(t: unknown): number | null {
  const id = asRecord(t).id;
  return typeof id === "number" ? id : null;
}

function isTermNamed(t: unknown, name: string): boolean {
  const n = asRecord(t).name;
  return typeof n === "string" && n.toLowerCase() === name.toLowerCase();
}

/** WordPress answers a duplicate term creation with code "term_exists" and
 *  puts the id of the term that already exists in data.term_id. Reading it
 *  turns a lost race into the right answer instead of a dropped category. */
function termIdFromExistsError(body: unknown): number | null {
  const obj = asRecord(body);
  if (obj.code !== "term_exists") return null;
  const data = asRecord(obj.data);
  const id = data.term_id;
  if (typeof id === "number") return id;
  // Some WordPress versions serialise term_id as a numeric string here.
  if (typeof id === "string" && /^\d+$/.test(id)) return Number(id);
  return null;
}

function extractPostResult(body: unknown): PostResult {
  const obj = asRecord(body);
  const id = typeof obj.id === "number" ? obj.id : null;
  const slug = typeof obj.slug === "string" ? obj.slug : null;
  const link = typeof obj.link === "string" ? obj.link : null;
  const status = typeof obj.status === "string" ? obj.status : null;
  if (id === null || slug === null || link === null || status === null) {
    return {
      ok: false,
      reason: "unexpected_response",
      message: "WordPress accepted the post but did not send back its address. Check your site directly to confirm it was created.",
    };
  }
  return { ok: true, id, slug, link, status };
}

// --- Public API --------------------------------------------------------

/**
 * The live validation run the moment an owner pastes in their WordPress
 * address, username, and application password. In order: reject a
 * non-HTTPS address outright (Application Passwords require it -
 * wp_is_application_passwords_supported checks is_ssl(), so a plain-http
 * site behaves as if the feature doesn't exist even if the password itself
 * is correct); confirm /wp-json/ answers and exposes the wp/v2 connection
 * point; sign in and read the connected user's roles and capabilities; and
 * report which SEO plugin (if any) is installed, from the same namespace
 * list.
 */
export async function connectWordPress(creds: WordPressCredentials): Promise<ConnectResult> {
  let parsed: URL;
  try {
    parsed = new URL(creds.url);
  } catch {
    return { ok: false, reason: "invalid_url", message: INVALID_URL_MSG };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, reason: "requires_https", message: REQUIRES_HTTPS_MSG };
  }
  if (isPrivateHost(parsed.hostname)) {
    return { ok: false, reason: "invalid_url", message: PRIVATE_HOST_MSG };
  }

  const root = await wpFetch(creds, "/wp-json/");
  if (!root.ok) {
    // At this point we have NOT established that WordPress exists here, so a
    // permission-shaped answer must not be reported as a permission problem.
    // A Next.js site (urbanglamhousekenya.com, 2026-08-18) answers this path
    // with a 308 to a 403 in plain text, and reporting that verbatim told the
    // owner to "change their role to Editor" on a site that has no WordPress,
    // no users, and no roles - an instruction they could follow forever
    // without getting anywhere. Only AFTER wp/v2 is confirmed below does an
    // auth or capability error mean what it says.
    const looksLikeAWall =
      root.reason === "insufficient_role" ||
      root.reason === "auth_failed" ||
      root.reason === "blocked_by_security" ||
      root.reason === "unexpected_response" ||
      root.reason === "wordpress_error";
    if (looksLikeAWall) {
      return { ok: false, reason: "rest_api_not_found", message: WP_API_NOT_FOUND_MSG };
    }
    return { ok: false, reason: root.reason, message: root.message };
  }

  const namespaces = extractNamespaces(root.body);
  if (!namespaces.includes("wp/v2")) {
    return { ok: false, reason: "rest_api_not_found", message: WP_API_NOT_FOUND_MSG };
  }
  const siteName = extractSiteName(root.body) ?? parsed.hostname;
  const seoPlugin = namespaces.includes("yoast/v1")
    ? ("yoast" as const)
    : namespaces.includes("rankmath/v1")
      ? ("rankmath" as const)
      : namespaces.includes("seopress/v1")
        ? ("seopress" as const)
        : null;

  const me = await wpFetch(creds, "/wp-json/wp/v2/users/me?context=edit");
  if (!me.ok) return { ok: false, reason: me.reason, message: me.message };

  const meObj = asRecord(me.body);
  const userId = typeof meObj.id === "number" ? meObj.id : 0;
  const roles = Array.isArray(meObj.roles) ? meObj.roles.filter((r): r is string => typeof r === "string") : [];
  const capsRaw = asRecord(meObj.capabilities);
  const capabilities: WordPressCapabilities = {
    edit_posts: capsRaw.edit_posts === true,
    publish_posts: capsRaw.publish_posts === true,
    upload_files: capsRaw.upload_files === true,
    edit_others_posts: capsRaw.edit_others_posts === true,
  };

  if (!capabilities.edit_posts) {
    const role = roles[0] ?? "user with no posting role";
    return {
      ok: false,
      reason: "cannot_create_posts",
      message: `The user you connected is a ${role}, which cannot create posts. In WordPress, go to Users, edit that user, and set the role to Editor (or Author, if they only need to work on their own posts).`,
    };
  }

  return {
    ok: true,
    siteName,
    userId,
    roles,
    capabilities,
    seoPlugin,
    canPublish: capabilities.publish_posts,
    canUploadMedia: capabilities.upload_files,
  };
}

/**
 * Upload one image. Sends the raw bytes as the body with Content-Type and
 * Content-Disposition headers (the documented shape - the alternative
 * multipart/form-data upload works but is undocumented, so we don't rely on
 * it). Setting alt text is a best-effort follow-up write, same reasoning as
 * featured_media below: it must never fail an otherwise-successful upload.
 */
export async function uploadMedia(creds: WordPressCredentials, input: MediaInput): Promise<MediaResult> {
  const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: "upload_failed",
      message: "This image is too large to publish (over 20MB). Use a smaller image and try again.",
    };
  }
  const safeName = sanitizeFilename(input.filename);
  const res = await wpFetch(creds, "/wp-json/wp/v2/media", {
    method: "POST",
    rawBody: {
      bytes,
      contentType: input.mimeType,
      contentDisposition: `attachment; filename="${safeName}"`,
    },
  });
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };

  const body = asRecord(res.body);
  const id = typeof body.id === "number" ? body.id : null;
  const url = typeof body.source_url === "string" ? body.source_url : null;
  if (id === null || url === null) {
    return {
      ok: false,
      reason: "unexpected_response",
      message: "WordPress accepted the image but did not send back the information we need to use it. Try uploading again.",
    };
  }

  if (input.altText) {
    // Best-effort: a missing alt text must never turn a successful upload
    // into a reported failure.
    await wpFetch(creds, `/wp-json/wp/v2/media/${id}`, { method: "POST", json: { alt_text: input.altText } });
  }
  return { ok: true, id, url };
}

/**
 * Turn category/tag NAMES into the term ids WordPress's posts endpoint
 * requires (categories/tags accept only integers, never names). Looks each
 * name up by search first, creates it when missing. Never throws - one name
 * that fails to resolve (a permissions issue, a genuine duplicate we
 * couldn't see, a network hiccup) is skipped so the rest of the post still
 * publishes; the caller gets back only the ids that resolved.
 */
export async function resolveTerms(
  creds: WordPressCredentials,
  kind: "categories" | "tags",
  names: string[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    try {
      const found = await wpFetch(creds, `/wp-json/wp/v2/${kind}?search=${encodeURIComponent(name)}&per_page=10`);
      if (found.ok && Array.isArray(found.body)) {
        const list = found.body as unknown[];
        // EXACT match only. WordPress's ?search= is a fuzzy substring match, so
        // asking for "SEO" on a site that already has "SEO Tips" returns that
        // instead - and taking the first result would quietly file the article
        // under a category the owner never asked for, with nothing anywhere
        // saying so. When there is no exact match the right answer is to create
        // the term, which is what the code below already does.
        const match = list.find((t) => isTermNamed(t, name));
        const id = termId(match);
        if (id !== null) {
          ids.push(id);
          continue;
        }
      }
      const created = await wpFetch(creds, `/wp-json/wp/v2/${kind}`, { method: "POST", json: { name } });
      if (created.ok) {
        const id = termId(created.body);
        if (id !== null) {
          ids.push(id);
          continue;
        }
      }
      // Lost a race: someone (or a parallel run) created this exact term
      // between our search and our create, and WordPress answers term_exists
      // carrying the id we wanted all along. Using it is strictly better than
      // dropping the category over a timing accident.
      const existingId = termIdFromExistsError(created.body);
      if (existingId !== null) {
        ids.push(existingId);
        continue;
      }
      // Creation failed for a real reason - skip this one name and keep
      // going. A missing category must never block the rest of the post.
    } catch {
      // Same reasoning: never let one bad name throw for the whole batch.
    }
  }
  return ids;
}

/**
 * Create a post. ALWAYS as a draft - there is no way to pass a different
 * status in, on purpose, so nothing can accidentally route around the
 * status:"future" decision explained at the top of this file. Category and
 * tag names are resolved to ids internally via resolveTerms().
 */
export async function createPost(creds: WordPressCredentials, draft: PostDraftInput): Promise<PostResult> {
  const categoryIds = draft.categories?.length ? await resolveTerms(creds, "categories", draft.categories) : [];
  const tagIds = draft.tags?.length ? await resolveTerms(creds, "tags", draft.tags) : [];

  const json: Record<string, unknown> = {
    title: draft.title,
    content: draft.html,
    status: "draft",
  };
  if (draft.slug) json.slug = draft.slug;
  if (draft.excerpt) json.excerpt = draft.excerpt;
  if (categoryIds.length) json.categories = categoryIds;
  if (tagIds.length) json.tags = tagIds;
  if (draft.featuredMediaId) json.featured_media = draft.featuredMediaId;

  const res = await wpFetch(creds, "/wp-json/wp/v2/posts", { method: "POST", json });
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };
  return extractPostResult(res.body);
}

/**
 * Replace a post's content after it is live.
 *
 * Exists for one job: the JSON-LD block. Structured data has to name the
 * page's real address, and that address does not exist until WordPress has
 * assigned the permalink - a site using date-based or plain (?p=) permalinks
 * publishes at an address nothing on our side could have predicted. So the
 * article goes out first and its structured data is written a moment later,
 * against the URL WordPress actually gave it.
 *
 * A failure here costs the article its rich-result markup, never the article.
 */
export async function updatePostContent(
  creds: WordPressCredentials,
  postId: number,
  html: string,
): Promise<{ ok: true } | WordPressFailure> {
  const res = await wpFetch(creds, `/wp-json/wp/v2/posts/${postId}`, {
    method: "POST",
    json: { content: html },
  });
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };
  return { ok: true };
}

/**
 * The owner edited a live article (src/lib/article-owner.ts): title, body
 * and excerpt in one write. Same endpoint as updatePostContent; WordPress
 * takes whichever fields are present.
 */
export async function updatePost(
  creds: WordPressCredentials,
  postId: number,
  fields: { title?: string; html?: string; excerpt?: string },
): Promise<{ ok: true } | WordPressFailure> {
  const json: Record<string, unknown> = {};
  if (fields.title !== undefined) json.title = fields.title;
  if (fields.html !== undefined) json.content = fields.html;
  if (fields.excerpt !== undefined) json.excerpt = fields.excerpt;
  const res = await wpFetch(creds, `/wp-json/wp/v2/posts/${postId}`, { method: "POST", json });
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };
  return { ok: true };
}

/**
 * Take a post off the site: WordPress's DELETE moves it to the trash (no
 * `force`), so the owner can still restore it from their own admin for
 * thirty days - the reversible choice, for the same reason a removed draft
 * is kept as history on our side.
 */
export async function deletePost(creds: WordPressCredentials, postId: number): Promise<{ ok: true } | WordPressFailure> {
  const res = await wpFetch(creds, `/wp-json/wp/v2/posts/${postId}`, { method: "DELETE" });
  // WordPress's own error body rides along: the owner's Remove tells "this
  // post is already gone" (its code) from "the REST route is broken" (both
  // 404s), and only the first may count as removed (article-owner.ts).
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message, body: res.body };
  return { ok: true };
}

/**
 * Flip a draft to published - the call our own cron makes at the moment the
 * owner actually wants the post live. Same endpoint as createPost; WordPress
 * has no separate "publish" action. See the file-level comment for why this
 * exists instead of status:"future" on creation - do not "fix" that back.
 *
 * A slug that comes back different from what was requested is NOT an error:
 * WordPress auto-suffixes collisions (wp_unique_post_slug - "my-post"
 * becomes "my-post-2"). We return whatever slug WordPress actually assigned
 * because our page records and rank tracking key off the real live URL.
 */
export async function publishPost(creds: WordPressCredentials, postId: number): Promise<PublishResult> {
  const res = await wpFetch(creds, `/wp-json/wp/v2/posts/${postId}`, { method: "POST", json: { status: "publish" } });
  if (!res.ok) return { ok: false, reason: res.reason, message: res.message };

  const body = asRecord(res.body);
  const link = typeof body.link === "string" ? body.link : null;
  const slug = typeof body.slug === "string" ? body.slug : null;
  if (!link || !slug) {
    return {
      ok: false,
      reason: "unexpected_response",
      message: "WordPress accepted the publish request but did not confirm the page's address. Check your site directly to confirm it went live.",
    };
  }
  return { ok: true, link, slug };
}
