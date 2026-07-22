import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";
import { isValidEmail } from "@/lib/waitlist";
import { DispatchMark } from "@/components/logo";
import { AuthShell } from "@/components/auth-shell";

export const dynamic = "force-dynamic";

// CLOUD_MODE password recovery, step 1: request a reset link. Self-host runs
// on a single shared password (dashboard-auth.ts) - there's no per-account
// password to reset - so it bounces to /login.
//
// Enumeration-safe: whatever the real outcome (unknown email, send failure,
// rate limit) the user always sees the same "if an account exists, we sent a
// link". Only a malformed address is called out - that's a client mistake, not
// a signal about who is registered - matching the waitlist's don't-leak-the-
// list posture. Supabase generates and emails the token and enforces its own
// per-address send throttle; this action just kicks it off and points the link
// back through /auth/callback so the recovery session is set server-side.
async function sendReset(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) redirect("/forgot-password?error=invalid");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const redirectTo = `${proto}://${host}/auth/callback?next=/reset-password`;

  try {
    const supabase = await supabaseAuth();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) console.error("[reset] resetPasswordForEmail failed:", error.message);
  } catch (e) {
    console.error("[reset] resetPasswordForEmail threw:", e);
  }
  redirect("/forgot-password?sent=1");
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  if (!isCloudMode()) redirect("/login");
  const { error, sent } = await searchParams;

  if (sent) {
    return (
      <AuthShell>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <p className="text-neutral-300">
          If an account exists for that email, we&apos;ve sent a password reset
          link. Check your inbox - the link expires in an hour.
        </p>
        <p className="text-sm text-neutral-500">
          Didn&apos;t get it? Check spam, or{" "}
          <Link href="/forgot-password" className="text-neutral-300 underline">
            try again
          </Link>
          .
        </p>
        <p className="text-sm text-neutral-500">
          <Link href="/login" className="text-neutral-300 underline">
            Back to sign in
          </Link>
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
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-white">Reset your password</h2>
        <p className="text-sm text-neutral-400">
          Enter your account email and we&apos;ll send a link to set a new one.
        </p>
      </div>
      <form action={sendReset} className="space-y-4">
        <input type="email" name="email" placeholder="Email" autoFocus className={inputCls} />
        {error === "invalid" ? (
          <p className="text-sm text-red-400">Enter a valid email address.</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
        >
          Send reset link
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Remembered it?{" "}
        <Link href="/login" className="text-neutral-300 underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
