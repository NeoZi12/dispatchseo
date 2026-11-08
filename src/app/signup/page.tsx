import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import Link from "next/link";
import { DispatchMark } from "@/components/logo";
import { AuthDivider } from "@/components/google-signin";
import { SignupConsent } from "@/components/signup-consent";
import { googleSignIn } from "@/app/auth/google-action";
import { AuthShell } from "@/components/auth-shell";
import { FormPending } from "@/components/dispatching";
import { ResendConfirmation, type ResendResult } from "@/components/resend-confirmation";
import { SignupRequirements } from "@/components/signup-requirements";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";
import { authCallbackUrl } from "@/lib/origin";
import { mintEmailLinkNonce } from "@/lib/email-link-nonce";
import { rateLimitHit, rateLimitKey } from "@/lib/rate-limit";
import { clientIp } from "@/lib/login-lockout";
import { cleanDomain, isValidDomain } from "@/lib/domain";
import { captureServer, identifyServer } from "@/lib/posthog-server";

export const dynamic = "force-dynamic";

// CLOUD_MODE account creation (onboarding step 1 of 5). Self-host installs
// have no accounts - one password, no signup - so they bounce to /login.
// If the Supabase project has email confirmation on, signUp returns no
// session and the user lands on the check-your-inbox note; with it off they
// go straight into the add-a-site wizard.
//
// ?domain= comes from the landing hero's type-your-domain CTA. It
// personalizes the headline here, and both auth paths stash it in the
// pending_domain cookie so the onboarding wizard can prefill step 1 -
// the visitor should never have to type their domain twice.

// Ties the consent checkbox (rendered above the Google button) to the email
// form further down the page, so one tick governs both signup paths.
const SIGNUP_FORM_ID = "signup-email-form";

const DOMAIN_COOKIE = "pending_domain";
// Which address the confirmation went to. The check-your-inbox screen needs it
// to name the address back to the user and to drive "send it again" - the
// redirect there carries no state, and putting an email in the URL would park
// it in history and in the Referer header. Short-lived: it is only useful
// during the confirm window.
const EMAIL_COOKIE = "pending_email";

async function stashDomain(formData: FormData): Promise<string | null> {
  const domain = cleanDomain(String(formData.get("domain") ?? ""));
  if (!isValidDomain(domain)) return null;
  (await cookies()).set(DOMAIN_COOKIE, domain, {
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "lax",
  });
  return domain;
}

async function signup(formData: FormData) {
  "use server";
  const domain = await stashDomain(formData);
  const back = domain ? `&domain=${encodeURIComponent(domain)}` : "";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  // The clickwrap. `required` on the box stops this in the browser, so reaching
  // here means the form was posted around the UI - but acceptance is the thing
  // the entire terms of service hangs off, so it is checked where it cannot be
  // skipped rather than trusted to the client.
  if (formData.get("accept") !== "yes") redirect(`/signup?error=terms${back}`);
  if (!email || password.length < 8) redirect(`/signup?error=weak${back}`);
  // Each signup sends a confirmation email: capped per network before
  // Supabase is asked (fails closed).
  const ip = clientIp(await headers());
  if (!(await rateLimitHit(rateLimitKey("auth-signup-ip", ip), 5, 3600))) redirect(`/signup?error=rate${back}`);
  const supabase = await supabaseAuth();
  // Without emailRedirectTo, Supabase sends the confirmed visitor to the
  // project's Site URL, which is "/" - the landing page, which has no idea what
  // to do with the credential in the query string. The link then "works" and
  // signs nobody in. Point it at the one route that exchanges it.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // Same link shape as every other email sign-in: a query string the
    // template appends to, bound to this browser (lib/email-link-nonce.ts).
    options: { emailRedirectTo: `${await authCallbackUrl()}?next=/onboarding&sn=${await mintEmailLinkNonce()}` },
  });
  if (error) {
    redirect(
      error.message.toLowerCase().includes("already")
        ? `/signup?error=exists${back}`
        : `/signup?error=1${back}`,
    );
  }
  // Supabase answers a signup for an address that ALREADY has an account with
  // a success, not an error: an obfuscated user, no session, and - this is the
  // part that bites - no email. That is deliberate (it stops signup being used
  // to discover who has an account here), and it also happens when the address
  // first signed up through Google. Left alone it renders as "check your inbox"
  // for a link that is never coming, which is the worst possible answer: the
  // person waits, checks spam, and retries forever.
  //
  // The obfuscated user is identifiable by an empty identities array, so say
  // the true thing instead. This does let someone probe which addresses have
  // accounts - but the error path below already tells them exactly that
  // whenever enumeration protection is off, so it is a line this signup form
  // has always been on the near side of.
  const identities = data.user?.identities;
  if (!data.session && Array.isArray(identities) && identities.length === 0) {
    redirect(`/signup?error=exists${back}`);
  }
  // A genuinely new account row exists past this point, whether or not email
  // confirmation still stands between here and a session.
  if (data.user) {
    await captureServer(data.user.id, "user_signed_up", { method: "email" });
    await identifyServer(data.user.id, { email });
  }
  if (!data.session) {
    (await cookies()).set(EMAIL_COOKIE, email, {
      path: "/",
      maxAge: 60 * 60,
      httpOnly: true,
      sameSite: "lax",
    });
    redirect("/signup?sent=1");
  }
  redirect("/onboarding?new=1");
}

// "Send it again" from the check-your-inbox screen.
//
// Worth knowing when reading the result: Supabase deliberately does NOT send
// anything when the address already belongs to an account (it returns an
// obfuscated success so an attacker cannot use signup to discover who has an
// account here). The same is true when the address first signed up through
// Google. So "sent" honestly means "sent if there was anything to send" - which
// is why the screen also points at Sign in rather than only promising an email.
async function resendConfirmation(): Promise<ResendResult> {
  "use server";
  const email = (await cookies()).get(EMAIL_COOKIE)?.value;
  if (!email) {
    return {
      ok: false,
      message: "That sign-up expired. Enter your email again to start over.",
    };
  }
  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    // Same link shape as every other email sign-in: a query string the
    // template appends to, bound to this browser (lib/email-link-nonce.ts).
    options: { emailRedirectTo: `${await authCallbackUrl()}?next=/onboarding&sn=${await mintEmailLinkNonce()}` },
  });
  if (!error) return { ok: true, message: "Sent. Give it a minute, then check spam too." };
  const status = (error as { status?: number }).status;
  const code = (error as { code?: string }).code ?? "";
  if (status === 429 || code.includes("rate_limit")) {
    return { ok: false, message: "Too many requests in a row. Wait a few minutes and try again." };
  }
  return { ok: false, message: "That didn't go through. Wait a moment and try again." };
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string; domain?: string }>;
}) {
  if (!isCloudMode()) redirect("/login");
  const { error, sent, domain: rawDomain } = await searchParams;
  const cleaned = cleanDomain(rawDomain ?? "");
  const domain = isValidDomain(cleaned) ? cleaned : null;
  // Signing up IS the setup flow's account step (2026-11-08), so this page
  // only forwards. A "check your inbox" visit
  // from an older signup still renders below.
  if (!sent && process.env.SETUP_PATH_LEGACY !== "1") {
    redirect(domain ? `/onboarding?domain=${encodeURIComponent(domain)}` : "/onboarding");
  }

  if (sent) {
    const pendingEmail = (await cookies()).get(EMAIL_COOKIE)?.value ?? null;
    return (
      <AuthShell>
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </Link>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-violet-500/25 bg-violet-500/10">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7 text-violet-300"
            aria-hidden
          >
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-white">Check your inbox</h1>
          <p className="text-[15px] leading-relaxed text-neutral-400">
            We sent a confirmation link to{" "}
            {pendingEmail ? (
              <span className="font-medium text-neutral-200">{pendingEmail}</span>
            ) : (
              "your email"
            )}
            . Click it to verify your address and pick your plan - the link expires in 24 hours.
          </p>
        </div>
        <div className="space-y-3 rounded-xl border border-neutral-800 bg-neutral-900/50 px-4 py-4">
          <p className="text-sm text-neutral-500">
            Nothing after a minute? Check your spam folder first.
          </p>
          <ResendConfirmation action={resendConfirmation} />
        </div>
        <p className="text-sm leading-relaxed text-neutral-500">
          Still nothing? If this address already has an account - including one you made with
          Google - we don&apos;t send a second link.{" "}
          <Link
            href="/login"
            className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
          >
            Sign in
          </Link>{" "}
          instead, or{" "}
          <Link
            href="/forgot-password"
            className="text-violet-400 underline underline-offset-2 hover:text-violet-300"
          >
            reset the password
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
        <h1 className="text-xl font-semibold text-white">
          <Link href="/" className="flex items-center gap-2.5">
            <DispatchMark className="h-7 w-auto" />
            DispatchSEO
          </Link>
        </h1>
        <p className="text-neutral-300">
          {domain ? (
            <>
              Create a free account and have your own AI run{" "}
              <span className="inline-flex items-center gap-1.5 align-bottom">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
                  alt=""
                  className="h-5 w-5 rounded"
                />
                <b className="font-semibold text-white">{domain}</b>
              </span>
              &apos;s SEO for you.
            </>
          ) : (
            <>Create a free account and have your own AI run your site&apos;s SEO for you.</>
          )}
        </p>
        {/* Said before the email field, not after checkout. It used to be the
            wizard's first screen - past the card - where an owner discovered
            there was nowhere to publish into. WordPress has its own door since
            2026-08-19, but the site builders still do not. */}
        <SignupRequirements />
        {/* One tick covers both buttons - it belongs to the email form below
            via the `form` attribute, and rides the Google form as a hidden
            field. Both server actions re-check it. */}
        <SignupConsent formId={SIGNUP_FORM_ID} googleAction={googleSignIn} domain={domain} />
        <AuthDivider />
        <form id={SIGNUP_FORM_ID} action={signup} className="space-y-4">
          <FormPending label="Creating your account" />
          {domain ? <input type="hidden" name="domain" value={domain} /> : null}
          <input type="email" name="email" placeholder="Email" className={inputCls} />
          <input
            type="password"
            name="password"
            placeholder="Password (8+ characters)"
            className={inputCls}
          />
          {error === "terms" ? (
            <p className="text-sm text-red-400">
              Tick the box to accept the terms of service and privacy policy first.
            </p>
          ) : error === "weak" ? (
            <p className="text-sm text-red-400">Use a valid email and at least 8 characters.</p>
          ) : error === "rate" ? (
            <p className="text-sm text-red-400">Too many attempts from this network. Try again in an hour.</p>
          ) : error === "exists" ? (
            // Amber, not red: the person did nothing wrong, they already have
            // what they were trying to make. The point is to hand them the way
            // in, including the Google case, which is the one that confuses.
            <div className="space-y-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-sm">
              <p className="font-medium text-amber-200">
                That address already has an account, so we didn&apos;t send a new confirmation
                link.
              </p>
              <p className="leading-relaxed text-amber-200/75">
                <Link
                  href="/login"
                  className="font-medium underline underline-offset-2 hover:text-white"
                >
                  Sign in
                </Link>{" "}
                instead. If you created it with Google, use the Google button above.{" "}
                <Link
                  href="/forgot-password"
                  className="underline underline-offset-2 hover:text-white"
                >
                  Forgot your password?
                </Link>
              </p>
            </div>
          ) : error ? (
            <p className="text-sm text-red-400">Could not create the account. Try again.</p>
          ) : null}
          <button
            type="submit"
            className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
          >
            Create account
          </button>
        </form>
        <p className="text-sm text-neutral-500">
          Already have one?{" "}
          <Link href="/login" className="text-neutral-300 underline">
            Sign in
          </Link>
        </p>
    </AuthShell>
  );
}
