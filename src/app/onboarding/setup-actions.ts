"use server";

// The new cloud setup's writes (src/lib/setup-flow.ts has the why).
//
// A "use server" file: every export is a public endpoint. checkSite,
// overrideSiteCheck and the three sign-ins run WITHOUT an account - they only
// probe a public address, set this browser's own cookies, or start a sign-in
// Supabase itself runs. The rest need a session and act only on the
// caller's own rows.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isCloudMode } from "@/lib/cloud";
import { currentUser, supabaseAuth } from "@/lib/cloud-auth";
import { freeSignupsOpen } from "@/lib/billing";
import { PROJECT_COOKIE } from "@/lib/active-project";
import { authCallbackUrl } from "@/lib/origin";
import { mintEmailLinkNonce } from "@/lib/email-link-nonce";
import { chooseGithubRepo } from "@/app/actions";
import {
  createHostedProjectForUser,
  DEVICE_COOKIE,
  overrideSetupSite,
  parsePlanPick,
  probeSite,
  readSetupSite,
  SETUP_SIGNIN_COOKIE,
  SETUP_SITE_COOKIE,
  setupCookieOptions,
  writePlanPick,
  writeSentCookie,
  writeSetupSite,
} from "@/lib/setup-flow";
import type { SiteVerdict } from "@/components/setup-stage/scenes";

/** Step 1: does this site fit? Remembers the answer for after sign-in. */
export async function checkSite(domain: string): Promise<SiteVerdict> {
  if (!isCloudMode()) return { kind: "unknown" };
  const { verdict, site } = await probeSite(String(domain ?? "").slice(0, 300));
  if (site) await writeSetupSite(site);
  // This browser's id for the free plan's gate (lib/free-gate.ts), set once.
  const jar = await cookies();
  if (!jar.get(DEVICE_COOKIE)?.value) {
    jar.set(DEVICE_COOKIE, randomBytes(16).toString("hex"), { ...setupCookieOptions(60 * 60 * 24 * 730) });
  }
  return verdict;
}

/** "Wrong guess - my site's code is on GitHub": the refused verdict is
 *  overruled for this browser's own checked address. */
export async function overrideSiteCheck(domain: string): Promise<SiteVerdict> {
  if (!isCloudMode()) return { kind: "unknown" };
  const site = await overrideSetupSite(String(domain ?? "").slice(0, 300));
  return site ? { kind: "ok", framework: null, host: site.host, hasBlog: site.hasBlog } : { kind: "unknown" };
}

// ---- step 2: the account ----------------------------------------------------

type SignInInput = { accept: boolean; tier?: string | null; interval?: string | null };

/** Shared by the three sign-ins: the terms box, and the paid-plan pick
 *  carried across the trip to GitHub, Google or the inbox. */
async function beforeSignIn(input: SignInInput): Promise<{ error: string } | null> {
  if (!isCloudMode()) return { error: "Sign-in isn't available here." };
  // Signing up forms the contract, so the same clickwrap as /signup.
  if (!input.accept) return { error: "Tick the box to accept the Terms first." };
  const pick = parsePlanPick(input.tier, input.interval);
  if (pick) await writePlanPick(pick);
  // Marks this sign-in as setup's own (lib/setup-flow.ts SETUP_SIGNIN_COOKIE).
  (await cookies()).set(SETUP_SIGNIN_COOKIE, "1", setupCookieOptions(60 * 60));
  return null;
}

/** Back to /onboarding after sign-in, where the callback has already made
 *  the site from the checked address. */
async function setupCallback(): Promise<string> {
  return `${await authCallbackUrl()}?next=${encodeURIComponent("/onboarding")}`;
}

/** Continue with GitHub or Google. Returns the provider's URL; the page
 *  navigates there (Supabase runs the OAuth dance, the PKCE verifier lands
 *  in a cookie here). */
export async function startOAuthSignIn(provider: "github" | "google", input: SignInInput): Promise<{ url: string } | { error: string }> {
  if (provider !== "github" && provider !== "google") return { error: "Unknown sign-in." };
  const blocked = await beforeSignIn(input);
  if (blocked) return blocked;
  const { data, error } = await (await supabaseAuth()).auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: await setupCallback(),
      // Google otherwise reuses whichever account the browser last used,
      // with no chooser (see auth/google-action.ts).
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    },
  });
  if (error || !data?.url) return { error: "That sign-in didn't start. Try again." };
  return { url: data.url };
}

/** "Email me a link": makes the account if it's new. The answer is the
 *  same whether or not the address already had one. */
export async function startEmailSignIn(rawEmail: string, input: SignInInput): Promise<{ ok: true; to: string } | { error: string }> {
  const email = String(rawEmail ?? "").trim().toLowerCase().slice(0, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  const blocked = await beforeSignIn(input);
  if (blocked) return blocked;
  // The link only works in this browser (lib/email-link-nonce.ts).
  const nonce = await mintEmailLinkNonce();
  const { error } = await (await supabaseAuth()).auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await setupCallback()}&sn=${nonce}` },
  });
  // Supabase's own per-address rate limit is the one error worth naming.
  // Anything else answers "sent" like a success, so this endpoint can't be
  // used to learn which addresses have accounts (e.g. with signups off).
  if (error && /rate|seconds/i.test(error.message)) return { error: "We just sent one. Give it a minute, then try again." };
  if (error) console.warn(`[setup] email sign-in not sent: ${error.message}`);
  await writeSentCookie(email, false);
  const [local, host] = email.split("@");
  return { ok: true, to: `${local.slice(0, 1)}***@${host}` };
}

// ---- after sign-in ----------------------------------------------------------

/** Signed in with no site yet (the address was typed after signing in, or
 *  the callback had no checked address): make it. */
export async function createSite(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: "Sign in again to continue." };
  const site = await readSetupSite();
  if (!site?.ok) return { error: "Check the address first." };
  const made = await createHostedProjectForUser(user.id, site.domain);
  if (!("ok" in made)) return { error: made.error };
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, made.project.slug, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  jar.delete(SETUP_SITE_COOKIE);
  revalidatePath("/onboarding");
  return { ok: true };
}

/** "Start free instead" on the checkout step: forget the paid pick. Only
 *  while the free plan is open - otherwise checkout is the way in. */
export async function chooseFreePlan(): Promise<{ ok: true } | { error: string }> {
  if (!freeSignupsOpen()) return { error: "The free plan isn't open yet." };
  await writePlanPick(null);
  revalidatePath("/onboarding");
  return { ok: true };
}

/** The installation covers several repos: the owner picks the site's.
 *  chooseGithubRepo does the auth, ownership and live-membership checks. */
export async function pickSetupRepo(slug: string, repo: string): Promise<{ ok: true } | { error: string }> {
  const fd = new FormData();
  fd.set("slug", slug);
  fd.set("repo", repo);
  const res = await chooseGithubRepo(null, fd);
  if (!res) return { error: "Something went wrong - try again." };
  return "error" in res ? { error: res.error } : { ok: true };
}
