import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, cookieValue } from "@/lib/dashboard-auth";
import { claimInstance, getSetupState, type SetupState } from "@/lib/setup";
import { missingMigrations } from "@/lib/schema-check";
import { DispatchMark } from "@/components/logo";
import { PasswordInput } from "@/app/setup/password-input";

// First-boot setup wizard. Public by design: it only ever renders
// instructions or the claim form, and claiming is race-safe (single-row PK).
// Once the instance is claimed - or on classic env installs - it redirects
// to /login and never shows again.
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
    secure: true,
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

// The three-step rail. Bolder than the dashboard wizard's thin segmented
// line - numbered, connected circles with labels - because this page has
// nothing else competing for attention. Prior steps fill solid violet with a
// check, the current step gets the same fill plus a soft ring, everything
// after stays neutral.
const SETUP_STEPS: { key: SetupState; label: string }[] = [
  { key: "no-db", label: "Connect database" },
  { key: "no-tables", label: "Create tables" },
  { key: "unclaimed", label: "Choose password" },
];

function SetupProgress({ state }: { state: SetupState }) {
  const idx = SETUP_STEPS.findIndex((s) => s.key === state);
  return (
    <ol className="flex" aria-label="Setup progress">
      {SETUP_STEPS.map((s, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <li key={s.key} className="relative flex flex-1 flex-col items-center">
            {i < SETUP_STEPS.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 top-5 h-0.5 w-full -translate-y-1/2 transition-colors ${
                  done ? "bg-violet-500" : "bg-neutral-800"
                }`}
              />
            )}
            <span
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold transition-colors ${
                done
                  ? "bg-violet-500 text-neutral-950"
                  : current
                    ? "bg-violet-500 text-neutral-950 ring-4 ring-violet-500/20"
                    : "bg-neutral-800 text-neutral-500"
              }`}
            >
              {done ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4" aria-hidden>
                  <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span
              className={`mt-2.5 max-w-[7.5rem] text-center text-[13px] font-medium leading-tight ${
                current ? "text-violet-300" : done ? "text-neutral-300" : "text-neutral-600"
              }`}
            >
              {s.label}
            </span>
          </li>
        );
      })}
    </ol>
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
  // Docker self-host: the stack bundles its own Postgres, so the two
  // database gates only appear when a container is unhealthy - show
  // docker triage instead of the cloud (Supabase/Vercel) walkthrough.
  const docker = Boolean(process.env.POSTGREST_URL);
  // Which migrations the probe says are absent - names the exact gap on the
  // tables step so a partial paste is diagnosable at a glance.
  const missing = state === "no-tables" ? await missingMigrations() : [];

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-3xl space-y-10">
        <div className="space-y-6">
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-white">
            <DispatchMark className="h-8 w-auto" />
            DispatchSEO setup
          </h1>
          <SetupProgress state={state} />
        </div>

        {state === "no-db" && docker && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Step 1 of 3 - waiting for the database</h2>
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
          </div>
        )}

        {state === "no-db" && !docker && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Step 1 of 3 - connect your database</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                You'll copy two values from Supabase into Vercel. Two browser
                tabs, about five minutes.
              </p>
            </div>
            <ol className="space-y-6">
              <Step n={1}>
                Sign in to{" "}
                <a href="https://supabase.com/dashboard" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  Supabase
                </a>{" "}
                and open any project - or click <Code>New project</Code>,
                it's free and ready in a minute.
              </Step>
              <Step n={2}>
                In a second tab, open your DispatchSEO project on{" "}
                <a href="https://vercel.com/dashboard" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  vercel.com
                </a>
                , then <Code>Settings</Code> → <Code>Environment Variables</Code>.
                The next two steps paste into it.
              </Step>
              <Step n={3}>
                In Supabase, copy the <Code>Project URL</Code> from your
                project's home page. In Vercel, save it as{" "}
                <Code>SUPABASE_URL</Code>.
              </Step>
              <Step n={4}>
                In Supabase, open{" "}
                <a href="https://supabase.com/dashboard/project/_/settings/api-keys" className="text-indigo-400 underline" target="_blank" rel="noreferrer">
                  API Keys
                </a>{" "}
                and copy the <Code>sb_secret_</Code> key (called{" "}
                <Code>service_role</Code> on older projects). In Vercel, save
                it as <Code>SUPABASE_SERVICE_ROLE_KEY</Code>.
              </Step>
              <Step n={5}>
                In Vercel: <Code>Deployments</Code> → <Code>⋯</Code> →{" "}
                <Code>Redeploy</Code>. When it finishes, come back here.
              </Step>
            </ol>
            {/* Plain link, not a server action: the flow guarantees a redeploy
                between page load and click, which kills any action reference. */}
            <a href="/setup" className={`block w-full text-center ${primaryAction}`}>
              I did this - check again
            </a>
          </div>
        )}

        {state === "no-tables" && docker && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Step 2 of 3 - waiting for the tables</h2>
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

        {state === "no-tables" && !docker && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Step 2 of 3 - create the tables</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                Database connected. One paste of SQL creates every table, and
                it's safe to run more than once.
              </p>
            </div>
            <ol className="space-y-6">
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
                and copy the whole file (the copy icon, top right).
              </Step>
              <Step n={2}>
                Paste it into your project's{" "}
                <a
                  href="https://supabase.com/dashboard/project/_/sql/new"
                  className="text-indigo-400 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  SQL Editor
                </a>{" "}
                in Supabase and press <Code>Run</Code>.{" "}
                <Code>Success. No rows returned</Code> means you're done.
              </Step>
            </ol>
            {missing.length > 0 && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-200">
                Still missing: {missing.join(", ")}. Running setup.sql adds
                exactly these and skips anything you already have.
              </p>
            )}
            <a href="/setup" className={`block w-full text-center ${primaryAction}`}>
              Tables created - check again
            </a>
          </div>
        )}

        {state === "unclaimed" && (
          <div className="space-y-6 rounded-xl border border-neutral-800 bg-neutral-900/60 p-7">
            <div>
              <h2 className="text-2xl font-semibold text-white">Step 3 of 3 - choose your password</h2>
              <p className="mt-3 text-lg leading-relaxed text-neutral-400">
                Last step. Pick the password you'll use to log in to this
                dashboard - everything else is generated for you on the next
                screen.
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
