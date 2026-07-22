import { redirect } from "next/navigation";
import Link from "next/link";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth, currentUser } from "@/lib/cloud-auth";
import { DispatchMark } from "@/components/logo";
import { AuthShell } from "@/components/auth-shell";

export const dynamic = "force-dynamic";

// CLOUD_MODE password recovery, step 2: set the new password. The user arrives
// here from the email link AFTER /auth/callback has exchanged the recovery
// token for a session - so a valid visitor is already signed in on a short-
// lived recovery session, and updateUser can change their password. No session
// means the link was missing, already used, or expired: we say so and send
// them back to request another rather than showing a form that can't work.
//
// On success we sign the recovery session out and bounce to /login?reset=1, so
// the user re-authenticates with the new password (confirming it works) and no
// lingering session is silently upgraded.
async function updatePassword(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) redirect("/reset-password?error=weak");
  if (password !== confirm) redirect("/reset-password?error=mismatch");

  const supabase = await supabaseAuth();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    // A vanished/expired recovery session lands here too - route it to the
    // "request another" copy instead of a generic failure.
    const expired = error.message.toLowerCase().includes("session");
    redirect(`/reset-password?error=${expired ? "expired" : "1"}`);
  }
  await supabase.auth.signOut();
  redirect("/login?reset=1");
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isCloudMode()) redirect("/login");
  const { error } = await searchParams;
  const user = await currentUser();

  if (!user) {
    return (
      <AuthShell>
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-white">Reset link invalid or expired</h2>
          <p className="text-sm text-neutral-400">
            This password reset link is no longer valid - they expire an hour
            after they&apos;re sent and can only be used once. Request a fresh
            one and it&apos;ll arrive in your inbox.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-block w-full rounded-lg bg-white px-4 py-3 text-center font-medium text-neutral-950"
        >
          Request a new link
        </Link>
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
      <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
        <DispatchMark className="h-7 w-auto" />
        DispatchSEO
      </h1>
      <div className="space-y-1">
        <h2 className="text-lg font-medium text-white">Set a new password</h2>
        <p className="text-sm text-neutral-400">
          {user.email ? (
            <>
              for <b className="font-medium text-neutral-300">{user.email}</b>
            </>
          ) : (
            "Choose a new password for your account."
          )}
        </p>
      </div>
      <form action={updatePassword} className="space-y-4">
        <input
          type="password"
          name="password"
          placeholder="New password (8+ characters)"
          autoFocus
          className={inputCls}
        />
        <input
          type="password"
          name="confirm"
          placeholder="Confirm new password"
          className={inputCls}
        />
        {error === "weak" ? (
          <p className="text-sm text-red-400">Use at least 8 characters.</p>
        ) : error === "mismatch" ? (
          <p className="text-sm text-red-400">The two passwords don&apos;t match.</p>
        ) : error === "expired" ? (
          <p className="text-sm text-red-400">
            Your reset session expired.{" "}
            <Link href="/forgot-password" className="underline">
              Request a new link
            </Link>
            .
          </p>
        ) : error ? (
          <p className="text-sm text-red-400">Could not update the password. Try again.</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
        >
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
