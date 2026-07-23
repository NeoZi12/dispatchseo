import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "./db";

// Single-user password gate. The password lives either in DASHBOARD_PASSWORD
// env (classic installs - env always wins) or, since the first-boot setup
// wizard, as a scrypt hash in instance_settings (claimed installs). The auth
// cookie is an HMAC of a fixed message keyed by the env password or by the
// stored hash string, so changing the password either way invalidates every
// existing session. No sessions table, no user model - one human.

const COOKIE_NAME = "dash_auth";
const MESSAGE = "seo-dashboard-v1";

export { COOKIE_NAME };

// Whether the session cookie may carry the Secure attribute. Hardcoding true
// breaks plain-HTTP installs: every browser rejects Secure cookies from
// http://<ip> origins, and stable Safari rejects them even on http://localhost
// (WebKit's loopback fix is still beta-only as of Safari 26) - the wizard and
// login then bounce back silently with no error. Trust the protocol the
// visitor actually arrived on: Next's standalone server and the bundled Caddy
// both set x-forwarded-proto, and a missing header just means the cookie goes
// unmarked, which still works.
export function cookieSecure(h: Headers): boolean {
  return (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";
}

type InstanceRow = {
  dashboard_password_hash: string;
  cron_secret: string;
  // Nullable, added by migration 0027; older rows simply lack them.
  app_url?: string | null;
  enc_key?: string | null;
  // 0029: encrypted (enc:v1:) service-account JSON the wizard stores so
  // self-hosters never touch .env; env GSC_SERVICE_ACCOUNT_JSON wins over it.
  gsc_service_account_json?: string | null;
  // 0030: encrypted GitHub token behind one-tap merge, same wizard-owned
  // pattern; env GH_MERGE_TOKEN wins over it.
  gh_merge_token?: string | null;
} | null;

// Every protected page checks the cookie, so the instance row is cached for
// a minute to keep auth from costing a DB round-trip per request. Claiming
// busts it; env-only installs never populate it. select("*") on purpose:
// naming columns here would make auth itself fail on an instance that
// hasn't applied the latest migration yet - star returns whatever exists.
let cache: { row: InstanceRow; at: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function instanceRow(): Promise<InstanceRow> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.row;
  try {
    const { data, error } = await db()
      .from("instance_settings")
      .select("*")
      .maybeSingle();
    // Table missing or transient error: fall back to the last known row so a
    // DB hiccup can't flap sessions; never cache the failure.
    if (error) return cache?.row ?? null;
    cache = { row: (data as InstanceRow) ?? null, at: Date.now() };
    return cache.row;
  } catch {
    return cache?.row ?? null;
  }
}

export function bustInstanceCache(): void {
  cache = null;
}

// Read-only access to the claimed instance's stored settings for modules
// that need more than auth (pipeline-pack's app_url, crypto's enc_key).
// Same cache, same tolerance: returns null on env-only installs.
export async function instanceSettings(): Promise<InstanceRow> {
  return instanceRow();
}

// The HMAC key for the session cookie. Env password wins; otherwise the
// stored scrypt hash doubles as the key (re-claiming rotates it).
export async function authSecret(): Promise<string | null> {
  const env = process.env.DASHBOARD_PASSWORD;
  if (env) return env;
  const row = await instanceRow();
  return row?.dashboard_password_hash ?? null;
}

export async function cookieValue(): Promise<string> {
  const secret = await authSecret();
  if (!secret) throw new Error("No dashboard password: instance unclaimed and DASHBOARD_PASSWORD unset");
  return createHmac("sha256", secret).update(MESSAGE).digest("hex");
}

export async function isValidCookie(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const secret = await authSecret();
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(MESSAGE).digest("hex");
  const a = Buffer.from(value);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function matchesHash(attempt: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const a = scryptSync(attempt, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isCorrectPassword(attempt: string): Promise<boolean> {
  const env = process.env.DASHBOARD_PASSWORD;
  if (env) {
    const a = Buffer.from(attempt);
    const b = Buffer.from(env);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const row = await instanceRow();
  if (!row?.dashboard_password_hash) return false;
  return matchesHash(attempt, row.dashboard_password_hash);
}

// The wizard-generated cron secret, for checkCron's fallback chain.
export async function instanceCronSecret(): Promise<string | null> {
  const row = await instanceRow();
  return row?.cron_secret ?? null;
}
