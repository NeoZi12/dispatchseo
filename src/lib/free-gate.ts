import { createHash } from "node:crypto";
import { domainToASCII } from "node:url";
import { getDomain } from "tldts";
import { db } from "./db";

// The free plan's abuse gate and memory (owner, 2026-11-08). Server-only.
//
// A free site costs us about $0.12 a month, and a new domain costs an abuser
// about $10 a year, so the DOMAIN is the wall: one free site per registrable
// domain, ever. The other keys catch the same person coming back with a
// different email, GitHub account, browser or network. Everything here is
// checked once, right before a free site's launch (the moment money starts),
// and everything it remembers lives in tables with no foreign keys
// (migration 0078), so deleting the site or the account never resets it.
//
// The engine asks three things of it: freeStartAllowed (may this owner start
// a free article now), recordFreeStart, and freeOwnerSpendMicrousd /
// recordFreeOwnerSpend (the free DataForSEO allowance). All of them fail
// CLOSED: they protect money, not access, so a database blip means "not now".

export type FreeKind = "domain" | "email" | "github" | "device" | "ip";

/** Days a free site may go without its owner opening the dashboard. */
export const FREE_IDLE_DAYS = 60;
/** The one warning email goes this many days before the pause. */
export const FREE_WARN_BEFORE_DAYS = 5;
/** One free site per network per this many days (shared IPs: CGNAT, offices). */
const IP_WINDOW_DAYS = 30;

// ---- keys -------------------------------------------------------------------

// Stable on purpose: changing the salt forgets every claim. Hashed so the
// table holds no raw IPs; a leak of it reveals nothing auth.users doesn't.
const SALT = process.env.FREE_GATE_SALT || "dispatchseo-free-gate-v1";

function keyOf(kind: FreeKind, value: string): string {
  return createHash("sha256").update(`${SALT}|${kind}|${value}`).digest("hex");
}

/** "https://Blog.Acme.co.uk/x" -> "acme.co.uk"; "foo.vercel.app" stays itself
 *  (a platform subdomain is its owner's whole site - Public Suffix List,
 *  private section). Null when there is no registrable domain. */
export function registrableDomain(raw: string): string | null {
  const host = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
  const ascii = domainToASCII(host);
  if (!ascii) return null;
  return getDomain(ascii, { allowPrivateDomains: true }) ?? null;
}

/** One person's many spellings of one inbox: case, "+tags" everywhere, and
 *  Gmail's ignored dots (googlemail.com is gmail.com). */
export function normalizeEmail(raw: string): string | null {
  const email = String(raw ?? "").trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  let local = email.slice(0, at).split("+")[0];
  let host = email.slice(at + 1);
  if (host === "googlemail.com") host = "gmail.com";
  if (host === "gmail.com") local = local.replace(/\./g, "");
  return local ? `${local}@${host}` : null;
}

let disposable: Set<string> | null = null;
/** A throwaway inbox (the open disposable-email-domains list), parent
 *  domains included (x.mailinator.com). */
export function isDisposableEmail(email: string): boolean {
  if (!disposable) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    disposable = new Set<string>(require("disposable-email-domains") as string[]);
  }
  const host = email.slice(email.lastIndexOf("@") + 1);
  const labels = host.split(".");
  for (let i = 0; i < labels.length - 1; i++) {
    if (disposable.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

// ---- the launch gate --------------------------------------------------------

export type FreeLaunchInput = {
  ownerId: string;
  projectId: string;
  domain: string;
  email: string | null;
  /** GitHub logins tied to this person: the sign-in identity and the
   *  repo's owner. */
  githubLogins: string[];
  ip: string | null;
  device: string | null;
};

export type FreeLaunchResult = { ok: true } | { ok: false; reason: FreeKind | "disposable" | "error" };

/** May this site launch on the free plan? Checks every key against what
 *  OTHER owners have already had, then remembers this launch. The same
 *  owner relaunching the same site is always fine. Fails closed. */
export async function claimFreeLaunch(input: FreeLaunchInput): Promise<FreeLaunchResult> {
  const domain = registrableDomain(input.domain);
  if (!domain) return { ok: false, reason: "domain" };
  const email = input.email ? normalizeEmail(input.email) : null;
  if (email && isDisposableEmail(email)) return { ok: false, reason: "disposable" };

  const keys: { kind: FreeKind; key: string }[] = [{ kind: "domain", key: keyOf("domain", domain) }];
  if (email) keys.push({ kind: "email", key: keyOf("email", email) });
  for (const login of new Set(input.githubLogins.map((l) => l.trim().toLowerCase()).filter(Boolean))) {
    keys.push({ kind: "github", key: keyOf("github", login) });
  }
  if (input.device) keys.push({ kind: "device", key: keyOf("device", input.device) });
  const ipKey = input.ip ? keyOf("ip", input.ip) : null;

  try {
    const unique = keys.map((k) => k.key);
    const { data: held, error } = await db().from("free_claims").select("kind, key, owner_user_id").in("key", unique).neq("kind", "ip");
    if (error) throw new Error(error.message);
    const other = (held ?? []).find((r) => (r as { owner_user_id: string }).owner_user_id !== input.ownerId) as { kind: FreeKind } | undefined;
    if (other) return { ok: false, reason: other.kind };

    if (ipKey) {
      const since = new Date(Date.now() - IP_WINDOW_DAYS * 86_400_000).toISOString();
      const { data: nets, error: ipErr } = await db()
        .from("free_claims")
        .select("owner_user_id")
        .eq("kind", "ip")
        .eq("key", ipKey)
        .gte("created_at", since)
        .neq("owner_user_id", input.ownerId)
        .limit(1);
      if (ipErr) throw new Error(ipErr.message);
      if (nets && nets.length > 0) return { ok: false, reason: "ip" };
    }

    // Remember. A unique-key race lost to another owner between the read and
    // here is a block, same as the read finding it.
    const mine = new Set(((held ?? []) as { key: string }[]).map((r) => r.key));
    const rows = keys
      .filter((k) => !mine.has(k.key))
      .map((k) => ({ kind: k.kind, key: k.key, owner_user_id: input.ownerId, project_id: input.projectId }));
    for (const row of rows) {
      const { error: insErr } = await db().from("free_claims").insert(row);
      if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
      if (insErr) {
        const { data: who } = await db().from("free_claims").select("owner_user_id").eq("kind", row.kind).eq("key", row.key).maybeSingle();
        if ((who as { owner_user_id?: string } | null)?.owner_user_id !== input.ownerId) return { ok: false, reason: row.kind };
      }
    }
    if (ipKey) {
      await db().from("free_claims").insert({ kind: "ip", key: ipKey, owner_user_id: input.ownerId, project_id: input.projectId });
    }
    await touchOwnerActivity(input.ownerId, true);
    return { ok: true };
  } catch (e) {
    console.warn(`[free-gate] launch check for ${input.ownerId} failed closed: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, reason: "error" };
  }
}

// ---- the engine's questions -------------------------------------------------

/** May this free owner start a free article right now? Not when paused for
 *  inactivity, not before the spacing since their last free start, and not
 *  past the month's allowance - all counted per OWNER, across every site
 *  they ever had. Fails closed. */
export async function freeStartAllowed(ownerId: string): Promise<boolean> {
  try {
    if (await freeOwnerPaused(ownerId)) return false;
    const { FREE_ARTICLES_PER_MONTH, freeSpacingDays } = await import("./billing");
    if (FREE_ARTICLES_PER_MONTH <= 0) return false;
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const { data, error } = await db()
      .from("free_article_starts")
      .select("started_at")
      .eq("owner_user_id", ownerId)
      .order("started_at", { ascending: false })
      .limit(FREE_ARTICLES_PER_MONTH + 1);
    if (error) return false;
    const starts = ((data ?? []) as { started_at: string }[]).map((r) => r.started_at);
    if (starts.filter((t) => t >= monthStart).length >= FREE_ARTICLES_PER_MONTH) return false;
    const last = starts[0];
    if (last && now.getTime() - new Date(last).getTime() < freeSpacingDays() * 86_400_000) return false;
    return true;
  } catch {
    return false;
  }
}

/** The engine calls this the moment it starts a free article. */
export async function recordFreeStart(ownerId: string, projectId: string, domain: string | null): Promise<void> {
  const { error } = await db().from("free_article_starts").insert({ owner_user_id: ownerId, project_id: projectId, domain });
  if (error) throw new Error(`free start not recorded: ${error.message}`);
}

/** A free owner's platform DataForSEO spend this month, in micro-dollars.
 *  Infinity on a read error, so a cap check denies. */
export async function freeOwnerSpendMicrousd(ownerId: string, monthStart: Date | string): Promise<number> {
  const month = (typeof monthStart === "string" ? monthStart : monthStart.toISOString()).slice(0, 7) + "-01";
  const { data, error } = await db().from("free_owner_spend").select("micro_usd").eq("owner_user_id", ownerId).eq("month", month).maybeSingle();
  if (error) return Number.POSITIVE_INFINITY;
  return Number((data as { micro_usd?: number } | null)?.micro_usd ?? 0);
}

/** Adds to a free owner's month (call beside the dataforseo_usage insert). */
export async function recordFreeOwnerSpend(ownerId: string, microUsd: number, at: Date = new Date()): Promise<void> {
  if (!(microUsd > 0)) return;
  const month = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const { error } = await db().rpc("free_owner_spend_add", { p_owner: ownerId, p_month: month, p_micro: Math.round(microUsd) });
  if (error) throw new Error(`free spend not recorded: ${error.message}`);
}

// ---- inactivity -------------------------------------------------------------

/** A signed-in dashboard visit. At most one write a day; a visit also
 *  clears a pending warning, which is what "log in to keep it going" means. */
export async function touchOwnerActivity(ownerId: string, force = false): Promise<void> {
  try {
    if (!force) {
      const { data } = await db().from("owner_activity").select("last_seen_at, pause_warned_at").eq("owner_user_id", ownerId).maybeSingle();
      const row = data as { last_seen_at: string; pause_warned_at: string | null } | null;
      if (row && !row.pause_warned_at && Date.now() - new Date(row.last_seen_at).getTime() < 20 * 3_600_000) return;
    }
    const now = new Date().toISOString();
    await db().from("owner_activity").upsert({ owner_user_id: ownerId, last_seen_at: now, pause_warned_at: null, updated_at: now }, { onConflict: "owner_user_id" });
  } catch {
    // A missed stamp costs nothing today; tomorrow's visit writes it.
  }
}

/** Is this free owner paused for inactivity? Only after the warning email
 *  actually went out and its notice ran - never a silent pause. No row (an
 *  owner from before this existed) is not paused. Fails closed. */
export async function freeOwnerPaused(ownerId: string): Promise<boolean> {
  const { data, error } = await db().from("owner_activity").select("last_seen_at, pause_warned_at").eq("owner_user_id", ownerId).maybeSingle();
  if (error) return true;
  const row = data as { last_seen_at: string; pause_warned_at: string | null } | null;
  if (!row || !row.pause_warned_at) return false;
  const idle = Date.now() - new Date(row.last_seen_at).getTime() >= FREE_IDLE_DAYS * 86_400_000;
  const noticed = Date.now() - new Date(row.pause_warned_at).getTime() >= (FREE_WARN_BEFORE_DAYS - 1) * 86_400_000;
  return idle && noticed;
}

/** The daily pass: free owners 55 days unseen get the one warning email.
 *  Idempotent (pause_warned_at), so running it more than once a day is
 *  harmless. Returns how many were warned. */
export async function sendInactivityWarnings(limit = 100): Promise<number> {
  const from = process.env.CUSTOMER_EMAIL_FROM;
  const apiKey = process.env.RESEND_API_KEY;
  // No customer sender configured: nobody is warned, so nobody pauses.
  if (!from || !apiKey) return 0;
  const cutoff = new Date(Date.now() - (FREE_IDLE_DAYS - FREE_WARN_BEFORE_DAYS) * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("owner_activity")
    .select("owner_user_id, last_seen_at")
    .lt("last_seen_at", cutoff)
    .is("pause_warned_at", null)
    .limit(limit);
  if (error || !data?.length) return 0;
  const { getSubscription, isActive } = await import("./billing");
  const { backendBaseUrl } = await import("./pipeline-pack");
  const base = await backendBaseUrl();
  let warned = 0;
  for (const row of data as { owner_user_id: string; last_seen_at: string }[]) {
    try {
      if (isActive(await getSubscription(row.owner_user_id))) continue;
      const { data: u } = await db().auth.admin.getUserById(row.owner_user_id);
      const to = u?.user?.email;
      if (!to) continue;
      const { data: site } = await db()
        .from("projects")
        .select("domain")
        .eq("owner_user_id", row.owner_user_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const domain = (site as { domain?: string } | null)?.domain ?? "your site";
      const pauseOn = new Date(new Date(row.last_seen_at).getTime() + FREE_IDLE_DAYS * 86_400_000).toLocaleDateString("en-US", { month: "long", day: "numeric" });
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject: `New articles for ${domain} pause on ${pauseOn}`,
          text:
            `Hi,\n\n` +
            `Nobody has opened the DispatchSEO dashboard for ${domain} in almost two months, so new free articles stop on ${pauseOn}.\n\n` +
            `To keep them coming, sign in before then:\n${base}/login\n\n` +
            `That's all it takes. The articles already on your site stay up either way, and if they do pause, signing in starts them again.\n\n` +
            `DispatchSEO`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) continue;
      await db().from("owner_activity").update({ pause_warned_at: new Date().toISOString() }).eq("owner_user_id", row.owner_user_id).is("pause_warned_at", null);
      warned++;
    } catch {
      // Next run tries again.
    }
  }
  return warned;
}
