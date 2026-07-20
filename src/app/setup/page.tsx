import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, cookieValue } from "@/lib/dashboard-auth";
import { claimInstance, getSetupState } from "@/lib/setup";
import { missingMigrations } from "@/lib/schema-check";
import { DispatchMark } from "@/components/logo";

// First-boot setup wizard. Public by design: it only ever renders
// instructions or the claim form, and claiming is race-safe (single-row PK).
// Once the instance is claimed - or on classic env installs - it redirects
// to /login and never shows again.
export const dynamic = "force-dynamic";

async function recheck() {
  "use server";
  redirect("/setup");
}

async function claim(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 10) redirect("/setup?error=short");
  if (password !== confirm) redirect("/setup?error=mismatch");
  // Capture this deploy's own public URL from the claim request itself -
  // the one moment we know for certain what domain the user is on. It
  // becomes the backend URL baked into every connected repo's workflows.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const appUrl = host ? `${proto}://${host}` : null;
  const result = await claimInstance(password, appUrl);
  if ("error" in result) redirect("/login");
  const jar = await cookies();
  jar.set(COOKIE_NAME, await cookieValue(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/setup/keys");
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-300">
        {n}
      </span>
      <span className="text-[15px] leading-relaxed text-neutral-300">{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[14px] text-neutral-200">
      {children}
    </code>
  );
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const state = await getSetupState();
  if (state === "ready") redirect("/login");
  const { error } = await searchParams;
  // Which migrations the probe says are absent - names the exact gap on the
  // tables step so a partial paste is diagnosable at a glance.
  const missing = state === "no-tables" ? await missingMigrations() : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-xl space-y-6">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO setup
        </h1>

        {state === "no-db" && (
          <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div>
              <h2 className="text-lg font-medium text-white">Step 1 of 3 - connect your database</h2>
              <p className="mt-1 text-[15px] text-neutral-400">
                DispatchSEO keeps everything in a Supabase database. You'll
                move two values from Supabase into Vercel, one at a time.
              </p>
            </div>
            <ol className="space-y-3">
              <Step n={1}>
                Sign in to your{" "}
                <a href="https://supabase.com/dashboard" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  Supabase dashboard
                </a>{" "}
                and open the project you want to use. Any project you already
                have is fine. No project yet? Click{" "}
                <Code>New project</Code> - it's free and ready in a minute or
                two.
              </Step>
              <Step n={2}>
                In a second tab, open your project at{" "}
                <a href="https://vercel.com/dashboard" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  vercel.com
                </a>{" "}
                and pick your DispatchSEO project, then{" "}
                <Code>Settings</Code> → <Code>Environment Variables</Code>.
                Keep this tab open - the next two steps paste into it.
              </Step>
              <Step n={3}>
                In Supabase, copy the{" "}
                <b className="text-neutral-200">Project URL</b> - it's on your
                project's home page, right under the project name, next to a{" "}
                <Code>Copy</Code> button. In the Vercel tab, type{" "}
                <Code>SUPABASE_URL</Code> in the <Code>Key</Code> box, paste
                the URL in the <Code>Value</Code> box, and press{" "}
                <Code>Save</Code>.
              </Step>
              <Step n={4}>
                Back in Supabase, open{" "}
                <a href="https://supabase.com/dashboard/project/_/settings/api-keys" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  API Keys
                </a>{" "}
                (<Code>Project Settings</Code> → <Code>API Keys</Code>; the
                link asks which project - pick the one from step 1) and
                copy the key starting with <Code>sb_secret_</Code> (on older
                projects it's called <Code>service_role</Code> - that one works
                too). In the Vercel tab, add a second variable: click{" "}
                <Code>Add Another</Code> if there's no empty <Code>Key</Code>{" "}
                box, type <Code>SUPABASE_SERVICE_ROLE_KEY</Code>, paste the
                key in the <Code>Value</Code> box, and press{" "}
                <Code>Save</Code> again.
              </Step>
              <Step n={5}>
                Restart the app so it sees them: in Vercel,{" "}
                <Code>Deployments</Code> → the <Code>⋯</Code> menu on the top
                deployment → <Code>Redeploy</Code>. Wait for it to finish,
                then come back here.
              </Step>
            </ol>
            <form action={recheck}>
              <button className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950">
                I did this - check again
              </button>
            </form>
          </div>
        )}

        {state === "no-tables" && (
          <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div>
              <h2 className="text-lg font-medium text-white">Step 2 of 3 - create the tables</h2>
              <p className="mt-1 text-[15px] text-neutral-400">
                Your database is connected. Now it needs its tables - one
                copy-paste of SQL, and it's safe to run more than once:
              </p>
            </div>
            <ol className="space-y-3">
              <Step n={1}>
                Open{" "}
                <a
                  href="https://github.com/NeoZi12/dispatchseo/blob/main/supabase/migrations/setup.sql"
                  className="text-indigo-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  setup.sql
                </a>{" "}
                and copy the whole file - the copy icon at the top right of
                the code does it in one click.
              </Step>
              <Step n={2}>
                Open your project's{" "}
                <a
                  href="https://supabase.com/dashboard/project/_/sql/new"
                  className="text-indigo-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  SQL Editor
                </a>{" "}
                in Supabase (the link asks which project - pick yours),
                paste, and press <Code>Run</Code>. When it says{" "}
                <Code>Success. No rows returned</Code>, you're done.
              </Step>
            </ol>
            {missing.length > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Still missing: {missing.join(", ")}. Running setup.sql adds
                exactly these and skips anything you already have.
              </p>
            )}
            <form action={recheck}>
              <button className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950">
                Migrations ran - check again
              </button>
            </form>
          </div>
        )}

        {state === "unclaimed" && (
          <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div>
              <h2 className="text-lg font-medium text-white">Step 3 of 3 - choose your password</h2>
              <p className="mt-1 text-[15px] text-neutral-400">
                Last step. Pick the password you'll use to log in to this
                dashboard - everything else is generated for you on the next
                screen.
              </p>
            </div>
            <form action={claim} className="space-y-3">
              <input
                type="password"
                name="password"
                placeholder="Choose a password (10+ characters)"
                autoFocus
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
              />
              <input
                type="password"
                name="confirm"
                placeholder="Repeat it"
                className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-white placeholder-neutral-500 focus:border-neutral-400 focus:outline-none"
              />
              {error === "short" && (
                <p className="text-sm text-red-400">At least 10 characters.</p>
              )}
              {error === "mismatch" && (
                <p className="text-sm text-red-400">Passwords don't match.</p>
              )}
              <button className="w-full rounded-lg bg-white px-4 py-3 font-medium text-neutral-950">
                Claim instance
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
