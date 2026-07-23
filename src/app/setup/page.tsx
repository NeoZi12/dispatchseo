import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, cookieSecure, cookieValue } from "@/lib/dashboard-auth";
import { claimInstance, getSetupState } from "@/lib/setup";
import { missingMigrations } from "@/lib/schema-check";
import { DispatchMark } from "@/components/logo";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { PasswordInput } from "@/app/setup/password-input";

// First-boot setup wizard for the DOCKER self-host stack - the only install
// that ever renders this page. Cloud accounts onboard through /signup and
// classic env installs (DASHBOARD_PASSWORD set) are born "ready", so both
// redirect to /login. The old manual Supabase-into-Vercel walkthrough that
// used to live here is gone with that install path; the two database states
// are container-failure triage now, not steps.
// Public by design: it only ever renders instructions or the claim form,
// and claiming is race-safe (single-row PK). Once the instance is claimed
// it redirects to /login and never shows again.
export const dynamic = "force-dynamic";

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
    secure: cookieSecure(h),
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect("/setup/keys");
}

// Shared primary-action look for the three "advance the wizard" controls
// (two plain <a> re-checks, one submit button) - always with a visible hover
// state and an explicit pointer cursor (Tailwind v4 preflight sets buttons to
// cursor: default).
const primaryAction =
  "rounded-lg bg-white px-4 py-3 font-medium text-neutral-950 transition-colors hover:bg-neutral-200 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-base font-semibold text-neutral-300">
        {n}
      </span>
      <span className="text-lg leading-8 text-neutral-300">{children}</span>
    </li>
  );
}

// UI labels and values inside instructions. Bold, no chip - the boxed-code
// look made every step read as denser than it is.
function Code({ children }: { children: React.ReactNode }) {
  return <b className="font-semibold text-white">{children}</b>;
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
  // tables screen so a partial migrate run is diagnosable at a glance.
  const missing = state === "no-tables" ? await missingMigrations() : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-3xl space-y-10">
        <div className="space-y-6">
          {/* The landing hero's pixel agent, settling in for the shift while
              the owner picks a password. Its .pixel-stage sizing lives in
              landing.css (scoped to .ld, not loaded here), so the wrapper
              recreates it with utilities. */}
          <div className="mx-auto w-full max-w-md [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">
            <PixelDispatcher />
          </div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-white">
            <DispatchMark className="h-8 w-auto" />
            DispatchSEO setup
          </h1>
        </div>

        {state === "no-db" && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Waiting for the database</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                Your stack bundles its own Postgres - nothing to sign up for.
                The app just can't reach it yet, which usually means the
                database container is still starting.
              </p>
            </div>
            <ol className="space-y-6">
              <Step n={1}>
                Give it ~20 seconds, then press the button below - on most
                machines that's all it takes.
              </Step>
              <Step n={2}>
                Still here? In the folder you installed from, run{" "}
                <Code>docker compose ps</Code> - the <Code>postgres</Code> row
                should say <Code>healthy</Code>. If it doesn't,{" "}
                <Code>docker compose logs postgres</Code> shows why, and{" "}
                <Code>docker compose up -d</Code> restarts anything stopped.
              </Step>
            </ol>
            <a href="/setup" className={`block w-full text-center ${primaryAction}`}>
              Check again
            </a>
            {/* Contributors running from source hit this state when their
                .env.local lacks a database - point them at the doc instead
                of leaving docker triage as the only clue. */}
            <p className="text-sm text-neutral-500">
              Running from source, not Docker?{" "}
              <a href="/docs/local-development" className="underline hover:text-neutral-300">
                The local development guide
              </a>{" "}
              lists the env this deploy is missing.
            </p>
          </div>
        )}

        {state === "no-tables" && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Waiting for the tables</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                The <Code>migrate</Code> container creates every table
                automatically on boot - no SQL to paste. It hasn't finished
                (or hit an error) on this stack yet.
              </p>
            </div>
            <ol className="space-y-6">
              <Step n={1}>
                In the folder you installed from, run{" "}
                <Code>docker compose up -d</Code> - it re-runs the migration,
                and running it again is always safe.
              </Step>
              <Step n={2}>
                If this screen keeps coming back,{" "}
                <Code>docker compose logs migrate</Code> shows what went
                wrong.
              </Step>
            </ol>
            {missing.length > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
                Still missing: {missing.join(", ")}.
              </p>
            )}
            <a href="/setup" className={`block w-full text-center ${primaryAction}`}>
              Check again
            </a>
          </div>
        )}

        {state === "unclaimed" && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Choose your password</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                Pick the password you'll use to log in to this dashboard -
                everything else is generated for you on the next screen.
              </p>
            </div>
            <form action={claim} className="space-y-4">
              <PasswordInput
                name="password"
                placeholder="Choose a password (10+ characters)"
                autoFocus
              />
              <PasswordInput name="confirm" placeholder="Repeat it" />
              {error === "short" && (
                <p className="text-sm text-red-400">At least 10 characters.</p>
              )}
              {error === "mismatch" && (
                <p className="text-sm text-red-400">Passwords don't match.</p>
              )}
              <button className={`w-full ${primaryAction}`}>Claim instance</button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
