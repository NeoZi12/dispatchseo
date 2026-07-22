import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { DispatchMark } from "@/components/logo";
import { AuthDivider, GoogleSignInButton } from "@/components/google-signin";
import { AuthShell } from "@/components/auth-shell";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";
import { cleanDomain, isValidDomain } from "@/lib/domain";

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

const DOMAIN_COOKIE = "pending_domain";

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
  if (!email || password.length < 8) redirect(`/signup?error=weak${back}`);
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect(
      error.message.toLowerCase().includes("already")
        ? `/signup?error=exists${back}`
        : `/signup?error=1${back}`,
    );
  }
  if (!data.session) redirect("/signup?sent=1");
  redirect("/onboarding?new=1");
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

  if (sent) {
    return (
      <AuthShell>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <p className="text-neutral-300">
          Check your inbox - we sent a confirmation link. Click it, then{" "}
          <Link href="/login" className="text-white underline">
            sign in
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
              Create a free account and have Claude Code run{" "}
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
            <>Create a free account and have Claude Code run your site&apos;s SEO for you.</>
          )}
        </p>
        <GoogleSignInButton label="Sign up with Google" domain={domain} />
        <AuthDivider />
        <form action={signup} className="space-y-4">
          {domain ? <input type="hidden" name="domain" value={domain} /> : null}
          <input type="email" name="email" placeholder="Email" className={inputCls} />
          <input
            type="password"
            name="password"
            placeholder="Password (8+ characters)"
            className={inputCls}
          />
          {error === "weak" ? (
            <p className="text-sm text-red-400">Use a valid email and at least 8 characters.</p>
          ) : error === "exists" ? (
            <p className="text-sm text-red-400">
              That email already has an account -{" "}
              <Link href="/login" className="underline">
                sign in
              </Link>
              .
            </p>
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
        <p className="text-xs text-neutral-600">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="underline hover:text-neutral-400">
            terms of service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-neutral-400">
            privacy policy
          </Link>
          .
        </p>
    </AuthShell>
  );
}
