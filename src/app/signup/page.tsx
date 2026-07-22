import { redirect } from "next/navigation";
import Link from "next/link";
import { DispatchMark } from "@/components/logo";
import { isCloudMode } from "@/lib/cloud";
import { supabaseAuth } from "@/lib/cloud-auth";

export const dynamic = "force-dynamic";

// CLOUD_MODE account creation (onboarding step 1 of 5). Self-host installs
// have no accounts - one password, no signup - so they bounce to /login.
// If the Supabase project has email confirmation on, signUp returns no
// session and the user lands on the check-your-inbox note; with it off they
// go straight into the add-a-site wizard.

async function signup(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || password.length < 8) redirect("/signup?error=weak");
  const supabase = await supabaseAuth();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    redirect(error.message.toLowerCase().includes("already") ? "/signup?error=exists" : "/signup?error=1");
  }
  if (!data.session) redirect("/signup?sent=1");
  redirect("/onboarding?new=1");
}

const inputCls =
  "w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  if (!isCloudMode()) redirect("/login");
  const { error, sent } = await searchParams;

  if (sent) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-950 p-6">
        <div className="w-full max-w-sm space-y-4">
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
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 p-6">
      <form action={signup} className="w-full max-w-xs space-y-4">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <input type="email" name="email" placeholder="Email" autoFocus className={inputCls} />
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
        <p className="text-sm text-neutral-500">
          Already have one?{" "}
          <Link href="/login" className="text-neutral-300 underline">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
