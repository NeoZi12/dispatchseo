import { redirect } from "next/navigation";
import { requireDashboard } from "@/lib/auth-gate";
import Link from "next/link";
import { instanceCronSecret } from "@/lib/dashboard-auth";
import { DEFAULT_PROJECT_ID, fetchProjectToken } from "@/lib/projects";
import { isCloudMode } from "@/lib/cloud";
import { DispatchMark } from "@/components/logo";

// Post-claim reveal: the keys the instance generated for itself. Guarded
// like every dashboard page; both values stay readable later (the MCP token
// on Settings, the cron secret here) - this screen is the friendly first
// look, not a one-time vault.
export const dynamic = "force-dynamic";

function KeyBlock({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-white">{label}</p>
      <code className="block break-all rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2.5 font-mono text-[13px] text-neutral-200">
        {value}
      </code>
      <p className="text-xs leading-relaxed text-neutral-500">{hint}</p>
    </div>
  );
}

export default async function SetupKeysPage() {
  // Docker self-host ONLY. These are the DEFAULT project's (ClockedCode's) live
  // MCP token + cron secret. In CLOUD_MODE, requireDashboard() passes for any
  // signed-in tenant and the proxy gates this route by cookie presence alone -
  // so without this guard any customer could read the maintainer's live keys.
  // Mirror the sibling setup/page.tsx redirect; keys live per-project on
  // Settings in cloud, never here.
  if (isCloudMode()) redirect("/login");
  await requireDashboard();

  const [mcpToken, cronSecret] = await Promise.all([
    fetchProjectToken(DEFAULT_PROJECT_ID),
    instanceCronSecret(),
  ]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold text-white">
          <DispatchMark className="h-7 w-auto" />
          You're in
        </h1>
        <div className="space-y-5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
          <p className="text-sm leading-relaxed text-neutral-400">
            DispatchSEO generated its own keys. No need to save them anywhere -
            the app shows them again whenever a step needs them:
          </p>
          {mcpToken && (
            <KeyBlock
              label="Agent key (MCP token)"
              value={mcpToken}
              hint="What your Claude Code uses to connect. The onboarding flow and Settings page both show it whenever you need it."
            />
          )}
          {cronSecret && (
            <KeyBlock
              label="Cron key"
              value={cronSecret}
              hint="Authorizes the scheduled jobs (GitHub Actions) to call this backend. The pipeline install sets it as a repo secret for you."
            />
          )}
          <Link
            href="/onboarding"
            className="block w-full cursor-pointer rounded-lg bg-white px-4 py-3 text-center font-medium text-neutral-950 transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            Continue - add your site →
          </Link>
          <p className="text-center text-xs text-neutral-500">
            The next screens add your site, connect Google, and start your
            first research run - about 10 minutes, one time.
          </p>
        </div>
      </div>
    </main>
  );
}
