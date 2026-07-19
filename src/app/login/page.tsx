import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, cookieValue, isCorrectPassword } from "@/lib/dashboard-auth";
import { getSetupState } from "@/lib/setup";
import {
  clearLoginFailures,
  clientIp,
  loginLockedUntil,
  recordLoginFailure,
} from "@/lib/login-lockout";
import { DispatchMark } from "@/components/logo";

async function login(formData: FormData) {
  "use server";
  const ip = clientIp(await headers());
  if (await loginLockedUntil(ip)) {
    redirect("/login?error=locked");
  }
  const attempt = String(formData.get("password") ?? "");
  if (!(await isCorrectPassword(attempt))) {
    const locked = await recordLoginFailure(ip);
    redirect(locked ? "/login?error=locked" : "/login?error=1");
  }
  await clearLoginFailures(ip);
  const jar = await cookies();
  jar.set(COOKIE_NAME, await cookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/dashboard");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // A fresh deploy has nothing to log into yet - hand off to the wizard.
  if ((await getSetupState()) !== "ready") redirect("/setup");
  const { error } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-950 p-6">
      <form action={login} className="w-full max-w-xs space-y-4">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO
        </h1>
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400"
        />
        {error === "locked" ? (
          <p className="text-sm text-red-400">
            Too many attempts. Locked for 15 minutes.
          </p>
        ) : error ? (
          <p className="text-sm text-red-400">Wrong password.</p>
        ) : null}
        <button
          type="submit"
          className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950"
        >
          Enter
        </button>
      </form>
    </main>
  );
}
