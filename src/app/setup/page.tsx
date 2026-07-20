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
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-semibold text-neutral-300">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-neutral-300">{children}</span>
    </li>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-neutral-800 px-1.5 py-0.5 font-mono text-[13px] text-neutral-200">
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
      <div className="w-full max-w-lg space-y-6">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          DispatchSEO setup
        </h1>

        {state === "no-db" && (
          <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
            <div>
              <h2 className="font-medium text-white">Step 1 of 3 - connect a database</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Your deployment is live but has no database yet. It takes two
                copy-pastes:
              </p>
            </div>
            <ol className="space-y-3">
              <Step n={1}>
                Open the Supabase project you want to use - any existing one
                works, or create a free project at{" "}
                <a href="https://supabase.com" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  supabase.com
                </a>{" "}
                (any name, any region).
              </Step>
              <Step n={2}>
                In that project: <Code>Project Settings</Code> → <Code>API</Code>. Copy the{" "}
                <b className="text-neutral-200">Project URL</b> and the{" "}
                <b className="text-neutral-200">service_role key</b>.
              </Step>
              <Step n={3}>
                In Vercel: your project → <Code>Settings</Code> →{" "}
                <Code>Environment Variables</Code>. Add them as{" "}
                <Code>SUPABASE_URL</Code> and <Code>SUPABASE_SERVICE_ROLE_KEY</Code>.
              </Step>
              <Step n={4}>
                Redeploy so the new variables load: <Code>Deployments</Code> → latest →{" "}
                <Code>Redeploy</Code>. Then come back here.
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
              <h2 className="font-medium text-white">Step 2 of 3 - create the tables</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Database connected. Run one SQL file to create (or complete)
                DispatchSEO's tables - it's idempotent, so re-running it is
                always safe:
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
                (every migration, one file) and copy its raw contents.
              </Step>
              <Step n={2}>
                In Supabase: <Code>SQL Editor</Code> → paste → <Code>Run</Code>.
                One paste, one time.
              </Step>
            </ol>
            {missing.length > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Missing right now: {missing.join(", ")}. Running setup.sql
                fills exactly these in - it skips everything already applied.
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
              <h2 className="font-medium text-white">Step 3 of 3 - claim this instance</h2>
              <p className="mt-1 text-sm text-neutral-400">
                Choose the dashboard password. DispatchSEO generates its other
                keys itself and shows them on the next screen.
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
