import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { cookies } from "next/headers";
import { db } from "./db";
import { currentUser, type CloudUser } from "./cloud-auth";
import { authSecret } from "./dashboard-auth";
import {
  annualBillingAvailable,
  annualCharge,
  annualSavingsPct,
  applyUnlessSecondPlan,
  ARTICLES_PER_WEEK,
  FREE_ARTICLES_PER_MONTH,
  freeSignupsOpen,
  getSubscription,
  getSubscriptionOrThrow,
  isActive,
  isBillingInterval,
  polar,
  polarConfigured,
  sitesRemaining,
  TIER_LIMITS,
  TIER_NAMES,
  tierForProductId,
  type BillingInterval,
  type Subscription,
  type Tier,
} from "./billing";
import { isCloudMode } from "./cloud";
import { PROJECT_COOKIE } from "./active-project";
import { reportCronRun } from "./cron-alerts";
import { DEFAULT_PROJECT_ID, getProjectBySlug, writerMode, type Project } from "./projects";
import { scopedProjects } from "./active-project";
import { cleanDomain, isValidDomain } from "./domain";
import { detectPlatform, labelFor, type Platform } from "./site-platform";
import { verdictFor } from "./qualifier";
import type { PlanMenu } from "@/components/setup-stage/scenes";
import { fetchProjectUrl, isPrivateHost } from "./url-guard";
import { fetchDomainRegistrationDate } from "./domain-age";
import { captureServer } from "./posthog-server";
import type { SiteVerdict } from "@/components/setup-stage/scenes";

// The cloud setup, one flow (owner, 2026-11-08 - there is no trial, there is
// a free plan): your site -> an account (GitHub, Google or an emailed link)
// -> checkout, ONLY for someone who picked a paid plan -> GitHub -> Google ->
// the dashboard's first-article card. Server-only.
//
// Which step someone is on is never a saved screen number. It is read off
// evidence every time: is there a session, a project, a live subscription, a
// plan pick, a repo, a Google grant. So a closed tab, a second device or
// a callback that lands late all resolve to the same answer, and nothing has
// to be kept in step with anything else.
//
// The address lives in a signed cookie until there is an account; the
// sign-in callback (auth/callback) turns it into the site. A paid pick from
// the pricing page lives in the setup_plan cookie until checkout succeeds;
// choosing the free plan on the plan step is recorded there too ("free").
// The account always exists BEFORE checkout, so every payment has an owner.

export type SetupStage = "address" | "checkout" | "github" | "google" | "done";

/** What the address step found, kept in a signed cookie until checkout. */
export type SetupSite = {
  domain: string;
  platform: Platform;
  host: string | null;
  framework: string | null;
  hasBlog: boolean;
  ok: boolean;
  /** Another DispatchSEO project already holds this domain. */
  taken?: boolean;
  /** The address answers "not found": there is no page there to read or
   *  verify. Refused, and never overridable (an override can't make a page). */
  noPage?: boolean;
  /** The check refused it and the owner said "my code is on GitHub". */
  override?: boolean;
  at: number;
};

export const SETUP_SITE_COOKIE = "setup_site";
/** A random id per browser, set on the address step: one of the free
 *  plan's abuse-gate keys (lib/free-gate.ts). */
export const DEVICE_COOKIE = "ds_device";
const SITE_TTL_S = 60 * 60 * 24;
/** Set when the SETUP page starts a sign-in, so the callback only turns the
 *  checked address into a site for a sign-in that setup began - never for
 *  someone signing in from /login with an old address cookie lying around. */
export const SETUP_SIGNIN_COOKIE = "setup_signin";
/** A paid plan picked on the pricing page ("growth:year"), until checkout. */
export const SETUP_PLAN_COOKIE = "setup_plan";
/** The masked address a sign-in link went to, for the "check your inbox"
 *  line - a cookie, so the address never sits in a URL or a log. */
export const SETUP_SENT_COOKIE = "setup_sent";

// ---- signed cookies ---------------------------------------------------------

// Same key the GitHub install nonce and the Google OAuth state use, so the
// cloud deployment needs no new secret.
async function secret(): Promise<string | null> {
  return process.env.OAUTH_STATE_SECRET || (await authSecret());
}

function b64(s: string): string {
  return Buffer.from(s).toString("base64url");
}

async function sign(body: string): Promise<string | null> {
  const key = await secret();
  return key ? createHmac("sha256", key).update(body).digest("base64url") : null;
}

export async function encodeSetupSite(site: SetupSite): Promise<string | null> {
  const body = b64(JSON.stringify(site));
  const mac = await sign(body);
  return mac ? `${body}.${mac}` : null;
}

export async function decodeSetupSite(raw: string | undefined): Promise<SetupSite | null> {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const expected = await sign(body);
  if (!expected) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const site = JSON.parse(Buffer.from(body, "base64url").toString()) as SetupSite;
    if (!site || typeof site.domain !== "string" || !isValidDomain(site.domain)) return null;
    if (Date.now() - Number(site.at) > SITE_TTL_S * 1000) return null;
    return site;
  } catch {
    return null;
  }
}

/** The address step's answer from this browser, or null. */
export async function readSetupSite(): Promise<SetupSite | null> {
  return decodeSetupSite((await cookies()).get(SETUP_SITE_COOKIE)?.value);
}

export function setupCookieOptions(maxAge: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
  };
}

/** Writes the cookie. Server actions and route handlers only. */
export async function writeSetupSite(site: SetupSite): Promise<boolean> {
  const value = await encodeSetupSite(site);
  if (!value) return false;
  (await cookies()).set(SETUP_SITE_COOKIE, value, setupCookieOptions(SITE_TTL_S));
  return true;
}

/** "neo@gmail.com" -> "n***@gmail.com". */
export function maskEmail(email: string): string {
  const [local, host] = email.split("@");
  return `${local.slice(0, 1)}***@${host ?? ""}`;
}

/** Remembers where a sign-in link went (and whether the address already
 *  had an account), for ten minutes. */
export async function writeSentCookie(email: string, existing: boolean): Promise<void> {
  (await cookies()).set(SETUP_SENT_COOKIE, `${existing ? "e" : "n"}|${maskEmail(email)}`, setupCookieOptions(10 * 60));
}

export async function readSentCookie(): Promise<{ to: string; existing: boolean } | null> {
  const v = (await cookies()).get(SETUP_SENT_COOKIE)?.value ?? "";
  const m = v.match(/^([en])\|([^\s<>|]{1,4}\*\*\*@[a-z0-9.-]{1,120})$/i);
  return m ? { to: m[2], existing: m[1] === "e" } : null;
}

// ---- the plan pick ----------------------------------------------------------

/** A paid plan, picked on the pricing page or on the plan step. */
export type PaidPlanPick = { tier: Tier; interval: BillingInterval };
/** What this browser chose on the plan step: a paid plan, or the free plan
 *  ({ tier: "free" }, recorded by chooseFreePlan so the step is not asked
 *  twice). A free pick never reaches Polar - see paidPick. */
export type PlanPick = PaidPlanPick | { tier: "free" };

/** "growth" + "year" -> a pick; anything else (a hand-edited URL, "free")
 *  -> null. Paid plans only: this is what URLs and the sign-in carry, and
 *  what a checkout link is built from. */
export function parsePlanPick(tier: unknown, interval: unknown): PaidPlanPick | null {
  if (tier !== "starter" && tier !== "growth" && tier !== "scale") return null;
  return { tier, interval: isBillingInterval(interval) ? interval : "month" };
}

/** The paid half of a pick; a free pick (or none) is null. */
export function paidPick(pick: PlanPick | null): PaidPlanPick | null {
  return pick && pick.tier !== "free" ? pick : null;
}

/** The pick this browser carried in from the pricing page or made on the
 *  plan step, or null. Not signed: it only chooses which card is selected
 *  (or that the free plan was chosen), and checkout prices come from Polar. */
export async function readPlanPick(): Promise<PlanPick | null> {
  const [tier, interval] = ((await cookies()).get(SETUP_PLAN_COOKIE)?.value ?? "").split(":");
  if (tier === "free") return { tier: "free" };
  return parsePlanPick(tier, interval);
}

/** Server actions and route handlers only. */
export async function writePlanPick(pick: PlanPick | null): Promise<void> {
  const jar = await cookies();
  if (!pick) jar.delete(SETUP_PLAN_COOKIE);
  else jar.set(SETUP_PLAN_COOKIE, pick.tier === "free" ? "free" : `${pick.tier}:${pick.interval}`, setupCookieOptions(SITE_TTL_S));
}

/** The plan step's cards, priced exactly as Polar charges them: every
 *  number from billing.ts. `yearly` = every tier has its yearly product
 *  (annualBillingAvailable), so the step never shows a price nobody can pay. */
export function buildPlanMenu(freeOpen: boolean, yearly: boolean = annualBillingAvailable()): PlanMenu {
  return {
    free: freeOpen ? { perMonth: FREE_ARTICLES_PER_MONTH } : null,
    yearly,
    paid: (["starter", "growth", "scale"] as const satisfies readonly Tier[]).map((tier) => ({
      tier,
      name: TIER_NAMES[tier],
      perWeek: ARTICLES_PER_WEEK[tier],
      monthly: TIER_LIMITS[tier].price,
      yearly: yearly ? { perMonth: TIER_LIMITS[tier].annual, charge: annualCharge(tier), savePct: annualSavingsPct(tier) } : null,
    })),
  };
}

// ---- the probe --------------------------------------------------------------

const UA = "Mozilla/5.0 (compatible; DispatchSEO/1.0; +https://dispatchseo.com/docs/site-check)";

/** Where the site is hosted (from response headers) and whether /blog
 *  answers - one request, the two chips on the address step. Best effort:
 *  any failure is "don't know", never an error. */
async function hostAndBlog(domain: string): Promise<{ host: string | null; hasBlog: boolean }> {
  if (isPrivateHost(domain)) return { host: null, hasBlog: false };
  try {
    // redirect: manual - a redirect is never followed off this host, so the
    // probe can't be bounced at an internal address.
    const res = await fetch(`https://${domain}/blog`, {
      redirect: "manual",
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(5000),
    });
    const h = (n: string) => (res.headers.get(n) ?? "").toLowerCase();
    const server = h("server");
    const host =
      res.headers.has("x-vercel-id") || server.includes("vercel")
        ? "Vercel"
        : res.headers.has("x-nf-request-id") || server.includes("netlify")
          ? "Netlify"
          : server.includes("github.com")
            ? "GitHub Pages"
            : res.headers.has("fly-request-id")
              ? "Fly.io"
              : res.headers.has("rndr-id")
                ? "Render"
                : server.includes("railway")
                  ? "Railway"
                  : res.headers.has("x-amz-cf-id") || server.includes("amazons3")
                    ? "AWS"
                    : res.headers.has("cf-ray") || server.includes("cloudflare")
                      ? "Cloudflare"
                      : null;
    const loc = h("location");
    const hasBlog = res.status === 200 || (res.status >= 300 && res.status < 400 && /\/blog\/?$/.test(loc));
    await res.body?.cancel().catch(() => {});
    return { host, hasBlog };
  } catch {
    return { host: null, hasBlog: false };
  }
}

/** True when an IP literal is one a server-side fetch must never reach:
 *  loopback, private, link-local (cloud metadata), CGNAT, multicast,
 *  unspecified, and the IPv6 equivalents (incl. IPv4-mapped). */
function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase();
  const mapped = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith("ff");
}

/** The hostname resolves, and only to public addresses. The hostname check
 *  in url-guard.ts can't see a public name pointed at 127.0.0.1 or the
 *  metadata service; this can. (A record that changes between this lookup
 *  and the fetch is not covered - the probe is a few reads of a homepage.) */
export async function resolvesPublic(host: string): Promise<boolean> {
  if (isPrivateHost(host)) return false;
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

type DomainHolder = { id: string; ownerId: string | null; blocking: boolean };

/** The project holding this domain (projects.domain is unique across every
 *  account), and whether it really holds it. A site still in setup that has
 *  neither paid nor connected GitHub does NOT: anyone can make one with a
 *  throwaway account, so letting it hold the domain would let a stranger
 *  lock the real owner out for good (security review, 2026-11-08). Such a
 *  holder gives way to the next person who claims the domain. A finished
 *  setup, a connected repo, a live plan, an older agent-mode site or an
 *  ownerless operator row always holds. (Proving ownership - a verified
 *  Search Console property - is the abuse gate's job, not this one.) */
async function domainHolder(domain: string): Promise<DomainHolder | null> {
  const { data, error } = await db()
    .from("projects")
    .select("id, owner_user_id, setup_connected_at, github_repo, writer_mode")
    .eq("domain", domain)
    .maybeSingle();
  // An unreadable row is treated as a real holder: never evict on a guess.
  if (error) return { id: "", ownerId: null, blocking: true };
  if (!data) return null;
  const row = data as { id: string; owner_user_id: string | null; setup_connected_at: string | null; github_repo: string | null; writer_mode: string | null };
  const shell = !row.setup_connected_at && !row.github_repo && row.writer_mode === "hosted" && Boolean(row.owner_user_id);
  const paid = shell ? isActive(await getSubscription(row.owner_user_id as string)) : true;
  return { id: row.id, ownerId: row.owner_user_id, blocking: !shell || paid };
}

/** Removes an unpaid, unconnected setup shell holding a domain someone else
 *  is claiming (see domainHolder). Conditional on the row still being that
 *  shell, so a holder that connected GitHub a second ago is never removed. */
async function evictShell(holder: DomainHolder): Promise<void> {
  if (!holder.id || holder.blocking || !holder.ownerId) return;
  await db()
    .from("projects")
    .delete()
    .eq("id", holder.id)
    .eq("owner_user_id", holder.ownerId)
    .is("setup_connected_at", null)
    .is("github_repo", null);
}

/** Another account's project really holds this domain. */
async function domainTaken(domain: string): Promise<boolean> {
  const holder = await domainHolder(domain);
  return Boolean(holder?.blocking);
}

/** The address step. Never throws: a probe that fails lets the person
 *  through ("unknown"), the same policy the old qualifier had - our check is
 *  not good enough to turn someone away on a timeout. */
export async function probeSite(raw: string): Promise<{ verdict: SiteVerdict; site: SetupSite | null }> {
  const domain = cleanDomain(raw);
  if (!isValidDomain(domain)) return { verdict: { kind: "idle" }, site: null };
  // The two cheap checks run together: this sits between a visitor and the
  // first answer the setup gives them, so every round trip shows.
  const [taken, reachable] = await Promise.all([domainTaken(domain), resolvesPublic(domain)]);
  // Already set up here: the checkout would pay for a site that can't be
  // created. "taken" rides the refused shape; the client words it.
  if (taken) {
    return { verdict: { kind: "refused", platform: "taken" }, site: { domain, platform: "unknown", host: null, framework: null, hasBlog: false, ok: false, taken: true, at: Date.now() } };
  }
  // Unresolvable or private: nothing is fetched. Let through as "unknown"
  // (a domain that isn't live yet is a normal case), never probed.
  if (!reachable) {
    return { verdict: { kind: "unknown" }, site: { domain, platform: "unreachable", host: null, framework: null, hasBlog: false, ok: true, at: Date.now() } };
  }
  try {
    const [result, extra, home] = await Promise.all([detectPlatform(domain), hostAndBlog(domain), homeStatus(domain)]);
    // An address with no page on it: nothing to read, nothing for Google to
    // verify, and the setup would stall after sign-up with no way forward
    // (owner rule 2026-11-10: refuse at the step where it can be known, or it
    // must just work). The one exception is GitHub Pages: a project site
    // lives at <owner>.github.io/<repo>/ and its host's root is often empty -
    // the GitHub step names the repo, and the launch finds the folder from it
    // (site-root-resolve.ts).
    if ((home === 404 || home === 410) && !isGithubPagesHost(domain, extra.host)) {
      return {
        verdict: { kind: "refused", platform: "no-page" },
        site: { domain, platform: result.platform, host: extra.host, framework: result.framework ?? null, hasBlog: false, ok: false, noPage: true, at: Date.now() },
      };
    }
    const v = verdictFor(result, "hosted", null);
    const site: SetupSite = {
      domain,
      platform: result.platform,
      host: extra.host,
      framework: result.framework ?? null,
      hasBlog: extra.hasBlog,
      ok: v.ok,
      at: Date.now(),
    };
    if (!v.ok) return { verdict: { kind: "refused", platform: labelFor(result.platform) }, site };
    // The homepage told us nothing (a bot wall, an error page) but the host
    // only serves deploys from a repo: that is a fit, said as one.
    if ((result.platform === "unknown" || result.platform === "unreachable") && !isCodeHost(extra.host)) return { verdict: { kind: "unknown" }, site };
    return { verdict: { kind: "ok", framework: site.framework, host: site.host, hasBlog: site.hasBlog }, site };
  } catch {
    const site: SetupSite = { domain, platform: "unknown", host: null, framework: null, hasBlog: false, ok: true, at: Date.now() };
    return { verdict: { kind: "unknown" }, site };
  }
}

/** The homepage's status code, or null when it did not answer. Redirects are
 *  followed on the same host only (fetchProjectUrl). */
async function homeStatus(domain: string): Promise<number | null> {
  const get = async (host: string) => (await fetchProjectUrl(`https://${host}/`, domain, { timeoutMs: 6_000, userAgent: UA }).catch(() => null))?.status ?? null;
  const apex = await get(domain);
  // cleanDomain strips "www.", and a site set up for www only (common on
  // Vercel and Netlify) answers 404 on the apex. Only "not found" on BOTH
  // counts as no page.
  if ((apex === 404 || apex === 410) && !domain.startsWith("www.")) {
    const www = await get(`www.${domain}`);
    if (www !== null && www !== 404 && www !== 410) return www;
  }
  return apex;
}

function isGithubPagesHost(domain: string, host: string | null): boolean {
  return /\.github\.io$/i.test(domain) || host === "GitHub Pages";
}

/** Hosts that only serve what a repo deployed. Cloudflare and AWS are not
 *  here: they front anything, builders included. */
const CODE_HOSTS = new Set(["Vercel", "Netlify", "GitHub Pages", "Fly.io", "Render", "Railway"]);
export function isCodeHost(host: string | null): boolean {
  return host !== null && CODE_HOSTS.has(host);
}

/** The owner says the check got it wrong: the site's code IS in a GitHub
 *  repo (a migrated site still hotlinking its old builder's images, a
 *  headless front end we misread). Their word wins - the GitHub step is the
 *  real test, and it fails plainly if there is no repo. Never for "taken":
 *  that one is a fact about our own database, not a guess. */
export async function overrideSetupSite(rawDomain: string): Promise<SetupSite | null> {
  const site = await readSetupSite();
  const domain = cleanDomain(rawDomain);
  if (!site || site.taken || site.noPage || site.domain !== domain) return null;
  const next: SetupSite = { ...site, ok: true, override: true, at: Date.now() };
  return (await writeSetupSite(next)) ? next : null;
}

// ---- the project ------------------------------------------------------------

/** "https://www.Acme.com/x" -> "acme.com". Shared with createProjectCore. */
export function normalizeProjectDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

export function isProjectDomain(domain: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain);
}

/** The first domain label, or the whole dashed domain if another project
 *  already took that (sub.example.com vs example.com). Shared with
 *  createProjectCore so both creation paths pick slugs the same way. */
export async function freeProjectSlug(domain: string): Promise<string> {
  const firstLabel = domain.split(".")[0];
  return (await getProjectBySlug(firstLabel)) ? domain.replace(/\./g, "-") : firstLabel;
}

/** "acme.com" -> "Acme". A label only, renameable on Settings. (Same rule as
 *  the setup path's nameFromDomain in app/setup-actions.ts.) */
export function nameFromDomain(domain: string): string {
  const labels = domain.replace(/^www\./, "").split(".").filter(Boolean);
  if (labels.length > 1) labels.pop();
  if (labels.length > 1 && /^(co|com|org|net|gov|ac|edu)$/.test(labels[labels.length - 1])) labels.pop();
  const base = labels.join(".") || domain;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export type CreatedProject = { ok: true; project: Project; created: boolean } | { error: string; code?: "taken" | "no_plan" | "bad_domain" };

/** The hosted-writer project for a user who has just made an account (or
 *  just paid). Idempotent: the user's own project for the same domain is
 *  returned as is, so the sign-in callback and the checkout return can each
 *  run twice (refresh, back button) and still end with one row. Takes the
 *  user id explicitly - the caller has just proven who it is and the session
 *  cookie it set may not be readable yet in the same request.
 *
 *  An account's FIRST site needs no plan yet: the plan step comes after
 *  this (free, or checkout for a paid one; resolveSetupStage decides). Every
 *  site after that needs room on a paid plan. */
export async function createHostedProjectForUser(userId: string, rawDomain: string, freshSub?: Subscription | null): Promise<CreatedProject> {
  const domain = normalizeProjectDomain(rawDomain);
  if (!isProjectDomain(domain)) return { error: "That address doesn't look right.", code: "bad_domain" };

  const { data: mine } = await db().from("projects").select("slug").eq("owner_user_id", userId).eq("domain", domain).maybeSingle();
  if (mine?.slug) {
    const existing = await getProjectBySlug(mine.slug);
    if (existing) return { ok: true, project: existing, created: false };
  }

  // freshSub: a plan row the caller has JUST written. getSubscription's
  // per-request memo may still hold the row as it was before that write.
  if (isCloudMode() && polarConfigured()) {
    const sub = freshSub !== undefined ? freshSub : await getSubscription(userId);
    const { count, error: countError } = await db().from("projects").select("id", { count: "exact", head: true }).eq("owner_user_id", userId);
    if (countError) return { error: "We couldn't check your sites just now. Reload to try again." };
    const owned = count ?? 0;
    const remaining = isActive(sub) ? (sitesRemaining(sub, owned) ?? 1) : owned === 0 ? 1 : 0;
    if (remaining <= 0) {
      return {
        error: isActive(sub)
          ? "Your plan's sites are all in use. Upgrade on the Billing page to add another."
          : "The free plan covers one site. Pick a plan on the Billing page to add another.",
        code: "no_plan",
      };
    }
  }

  const slug = await freeProjectSlug(domain);
  const siteLaunchedAt = await fetchDomainRegistrationDate(domain);
  const row: Record<string, unknown> = {
    slug,
    name: nameFromDomain(domain),
    domain,
    // Null, not createProjectCore's sc-domain guess: the first-article card
    // reads a set gsc_site_url as "Google confirmed", and the launch job
    // finds or adds the real property once Google is connected.
    gsc_site_url: null,
    github_repo: null,
    mcp_token: randomBytes(24).toString("hex"),
    mode: "auto",
    auto_merge: true,
    content_mode: "detect",
    onboarding_screen: "c1",
    owner_user_id: userId,
    keyword_source: "dataforseo",
    writer_mode: "hosted",
    ai_choice: "hosted",
  };
  if (siteLaunchedAt) row.site_launched_at = siteLaunchedAt;
  let { error } = await db().from("projects").insert(row);
  // Held by another account's unpaid, unconnected setup shell: it gives way
  // (domainHolder), then one more try.
  if (error?.code === "23505") {
    const holder = await domainHolder(domain);
    if (holder && holder.ownerId !== userId && !holder.blocking) {
      await evictShell(holder);
      ({ error } = await db().from("projects").insert(row));
    }
  }
  if (error) {
    // Two tabs racing the same return: the other one inserted first.
    if (error.code === "23505") {
      const { data: again } = await db().from("projects").select("slug, owner_user_id").eq("domain", domain).maybeSingle();
      if (again?.owner_user_id === userId) {
        const p = await getProjectBySlug(again.slug as string);
        if (p) return { ok: true, project: p, created: false };
      }
      return { error: `${domain} is already set up on another DispatchSEO account.`, code: "taken" };
    }
    return { error: error.message };
  }
  const project = await getProjectBySlug(slug);
  if (!project) return { error: "The site was saved but couldn't be read back - reload to continue." };
  await captureServer(userId, "project_created", { domain, flow: "setup" });
  return { ok: true, project, created: true };
}

// ---- claiming a checkout ----------------------------------------------------

type Checkout = Awaited<ReturnType<ReturnType<typeof polar>["checkouts"]["get"]>>;

export type ClaimResult =
  | { ok: true; slug: string | null }
  | { pending: true }
  | { error: "checkout" | "taken" | "no_plan" | "duplicate" };

/** The user's own project still in setup (hosted, unstamped), newest first. */
async function pendingProjectFor(userId: string): Promise<Project | null> {
  const { data } = await db()
    .from("projects")
    .select("slug")
    .eq("owner_user_id", userId)
    .is("setup_connected_at", null)
    .eq("writer_mode", "hosted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.slug ? getProjectBySlug(data.slug as string) : null;
}

/** Turns a finished setup checkout into the plan row (and the site, if the
 *  sign-in callback could not make it), for the account it was made FOR.
 *  The checkout route always creates checkouts with externalCustomerId set
 *  to the signed-in user, so anything else is refused. Writes the plan row
 *  itself rather than waiting on the webhook, so the next page already sees
 *  the plan; the webhook writing the same row later is harmless (upsert).
 *  Cookie writes, so route handlers and server actions only. Safe to run
 *  twice. */
export async function claimCheckoutForUser(checkout: Checkout, userId: string): Promise<ClaimResult> {
  if (checkout.status !== "succeeded") return { error: "checkout" };
  const tier = checkout.productId ? tierForProductId(checkout.productId) : null;
  if (!tier) return { error: "checkout" };
  if (checkout.externalCustomerId !== userId) {
    await reportCronRun(
      "polar-return",
      { error: `Checkout ${checkout.id} belongs to ${checkout.externalCustomerId ?? "no account"} but user ${userId} tried to claim it - refused.` },
      true,
    );
    return { error: "checkout" };
  }

  // No subscription id yet: write nothing - the webhook writes the row from
  // Polar's own record, and the page waits for it.
  if (!checkout.subscriptionId) return { pending: true };

  const sub = await polar().subscriptions.get({ id: checkout.subscriptionId });
  const applied = await applyUnlessSecondPlan(
    userId,
    {
      status: sub.status,
      tier: tierForProductId(sub.productId) ?? tier,
      providerCustomerId: sub.customerId,
      providerSubscriptionId: sub.id,
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toISOString() : null,
      cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    },
    "polar-return",
  );
  // A second live plan on one account: reported for a refund (see
  // applyUnlessSecondPlan); the person is told so rather than "try again".
  if (applied === "skipped") return { error: "duplicate" };
  await writePlanPick(null);

  const jar = await cookies();
  let project = await pendingProjectFor(userId);
  let result: ClaimResult = { ok: true, slug: project?.slug ?? null };
  if (!project) {
    const metaDomain = typeof checkout.metadata?.domain === "string" ? checkout.metadata.domain : null;
    const domain = metaDomain ?? (await readSetupSite())?.domain ?? null;
    if (domain) {
      // Read fresh: getSubscription's per-request memo may hold the row from
      // before the write above.
      const made = await createHostedProjectForUser(userId, domain, await getSubscriptionOrThrow(userId).catch(() => null));
      if ("ok" in made) project = made.project;
      else if (made.code === "taken") result = { error: "taken" };
      else if (made.code === "no_plan") result = { error: "no_plan" };
      if ("ok" in made || made.code === "taken") jar.delete(SETUP_SITE_COOKIE);
    }
  }
  if (project) {
    jar.set(PROJECT_COOKIE, project.slug, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    result = { ok: true, slug: project.slug };
  }
  return result;
}

/** The sign-in callback's half of setup: the address this browser checked
 *  becomes the new account's site, so the person lands on the next step
 *  instead of typing it again. Does nothing when there is no checked
 *  address or the account already has a site in setup. Never throws - the
 *  address step's Continue does the same thing by hand. */
export async function createSiteAfterSignIn(userId: string): Promise<void> {
  try {
    const jar0 = await cookies();
    const fromSetup = jar0.get(SETUP_SIGNIN_COOKIE)?.value === "1";
    jar0.delete(SETUP_SIGNIN_COOKIE);
    if (!fromSetup) return;
    const site = await readSetupSite();
    if (!site?.ok) return;
    if (await pendingProjectFor(userId)) return;
    const made = await createHostedProjectForUser(userId, site.domain);
    if (!("ok" in made)) return;
    const jar = await cookies();
    jar.set(PROJECT_COOKIE, made.project.slug, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
    jar.delete(SETUP_SITE_COOKIE);
  } catch (e) {
    console.warn(`[setup-flow] site after sign-in for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---- users ------------------------------------------------------------------

/** The signed-in user's project still in setup (hosted, unstamped), newest
 *  first, or null. */
export async function pendingSetupProject(): Promise<Project | null> {
  const mine = await scopedProjects();
  return (
    [...mine]
      .filter((p) => p.id !== DEFAULT_PROJECT_ID && !p.setup_connected_at && writerMode(p) === "hosted")
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null
  );
}

// ---- the stage --------------------------------------------------------------

export type SetupState = {
  stage: SetupStage;
  user: CloudUser | null;
  project: Project | null;
  sub: Subscription | null;
  site: SetupSite | null;
  /** The paid plan the plan step preselects: the pricing-page pick, or
   *  Starter while the free plan is closed. Null on the plan step = no paid
   *  pick (the step preselects its default); never a free pick. */
  checkoutPlan: PaidPlanPick | null;
  /** The plan step belongs in this setup's rail: billing is on here. True
   *  even once the step is behind them (a plan chosen or already live), so
   *  the rail does not lose a node the person just completed. */
  planStep: boolean;
  /** The free plan is open, so the plan step shows the Free card. */
  freeOpen: boolean;
  /** A project from the older setup (agent writer) - the caller keeps it on
   *  the old setup path rather than this flow. */
  legacy: boolean;
};

/** Which step this visitor is on, from evidence. `urlPick` is a plan named
 *  in this request's URL (/onboarding?plan=growth&interval=year) - a pick the
 *  cookie may not hold yet, because a page render can't write cookies.
 *
 *  The plan step (stage "checkout") is asked of every new site on a
 *  deployment with billing, until one of these is true: a plan is live, or
 *  this browser chose the free plan there (a "free" pick, only honoured
 *  while the free plan is open). A paid pick only preselects its card. */
export async function resolveSetupStage(urlPick: PaidPlanPick | null = null): Promise<SetupState> {
  const user = await currentUser();
  const site = await readSetupSite();
  const freeOpen = freeSignupsOpen();
  const pick: PlanPick | null = urlPick ?? (await readPlanPick());
  // No billing on this deployment (self-host, a preview without Polar): no
  // plan step at all - there would be nothing to pick or pay.
  const billing = isCloudMode() && polarConfigured();
  // While the free plan is closed, Starter is the card preselected (and a
  // stale "free" pick from before it closed counts for nothing).
  const fallback: PaidPlanPick | null = freeOpen ? null : { tier: "starter", interval: "month" };
  const chosenFree = pick?.tier === "free" && freeOpen;
  const preselect = paidPick(pick) ?? fallback;
  const base = { user, site, project: null, sub: null, checkoutPlan: billing && !chosenFree ? preselect : null, planStep: billing, freeOpen, legacy: false };
  if (!user) return { ...base, stage: "address" };

  const [sub, mine] = await Promise.all([getSubscription(user.id), scopedProjects()]);
  // Newest first; one still being set up wins over finished ones.
  const sorted = [...mine].filter((p) => p.id !== DEFAULT_PROJECT_ID).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const project = sorted.find((p) => !p.setup_connected_at) ?? sorted[0] ?? null;
  const active = isActive(sub);
  // The plan step is still to do: billing is on, no plan is live, and the
  // free plan was not chosen on it.
  const planDue = billing && !active && !chosenFree;
  const checkoutPlan = planDue ? preselect : null;

  // Signed in with no site (the sign-in callback had no checked address):
  // the address step, whose Continue makes the site (createSite). Nothing is
  // ever written during a render.
  if (!project) return { ...base, sub, checkoutPlan, stage: "address" };
  const state = { ...base, sub, project, checkoutPlan, legacy: writerMode(project) !== "hosted" };
  if (project.setup_connected_at) return { ...state, stage: "done" };
  if (planDue) return { ...state, stage: "checkout" };
  if (!project.github_repo) return { ...state, stage: "github" };
  if (!project.gsc_oauth_refresh_token) return { ...state, stage: "google" };
  return { ...state, stage: "done" };
}
