import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidCookie } from "@/lib/dashboard-auth";
import { serviceAccountEmail } from "@/lib/gsc";
import { db } from "@/lib/db";
import { getActiveProject } from "@/lib/active-project";
import { fetchProjectToken } from "@/lib/projects";
import { OnboardingWizard, type WizardResume } from "@/components/onboarding-wizard";
import { WIZARD_SCREENS } from "@/lib/wizard-screens";
import { DispatchMark } from "@/components/logo";

export const dynamic = "force-dynamic";

// The add-a-site wizard: site -> Search Console -> keyword data source ->
// publish mode -> one-tap merge -> timeline -> live finale. /new redirects
// here with ?new=1; the classic form is retired.
//
// Resume: if the active project is already configured (repo connected) and
// this is not an explicit "add a new site" visit, rebuild the wizard's
// client state server-side - saved screen (0030), the created-project box,
// the keyword-source choice - so a closed tab or stuck terminal continues
// exactly where it stood instead of restarting at step 1.
async function buildResume(): Promise<WizardResume | null> {
  const project = await getActiveProject();
  if (!project?.github_repo) return null;
  const mcpToken = await fetchProjectToken(project.id);
  if (!mcpToken) return null;
  // Tolerant read: pre-0030 databases lack the column; resume is a nicety.
  let savedScreen: string | null = null;
  try {
    const { data } = await db()
      .from("projects")
      .select("onboarding_screen")
      .eq("id", project.id)
      .maybeSingle();
    savedScreen = (data as { onboarding_screen?: string | null } | null)?.onboarding_screen ?? null;
  } catch {
    savedScreen = null;
  }
  const screen =
    savedScreen && (WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as WizardResume["screen"])
      : "s5";
  return {
    // Never resume INTO step 1 - the project exists; land on the next step.
    screen: screen === "s0" ? "s1" : screen,
    created: {
      slug: project.slug,
      name: project.name,
      domain: project.domain,
      mcpToken,
    },
    choice: project.keyword_source === "dataforseo" ? "paid" : "free",
    serpConnected: project.keyword_source === "serpapi",
  };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const jar = await cookies();
  if (!(await isValidCookie(jar.get("dash_auth")?.value))) redirect("/login");

  // The MCP connect command needs this deployment's public origin. Behind
  // Vercel the forwarded headers are trustworthy; localhost falls out naturally.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const { new: isNew } = await searchParams;
  const resume = isNew === "1" ? null : await buildResume();

  // Standalone shell on purpose - no sidebar, no dashboard chrome. The
  // owner sees the wizard and only the wizard until setup verifies and
  // unlocks the dashboard (this route lives OUTSIDE the (dashboard) group).
  return (
    <main className="min-h-screen px-5 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <p className="flex items-center gap-2.5 text-lg font-semibold text-white">
            <DispatchMark className="h-7 w-auto" />
            DispatchSEO
          </p>
          {/* Escape hatch to the plain-English walkthrough - the wizard's
              only external help surface, so keep the anchor in sync with
              docs/SELF_HOSTING.md's wizard section heading. */}
          <a
            href="https://github.com/NeoZi12/dispatchseo/blob/main/docs/SELF_HOSTING.md#the-setup-wizard-step-by-step"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Stuck? Open the quick guide ↗
          </a>
        </div>
        <OnboardingWizard
          saEmail={await serviceAccountEmail()}
          origin={origin}
          resume={resume}
          // Docker marker: the compose stack talks to Postgres through
          // PostgREST. Docker installs get builder guidance (in-stack
          // builds) instead of the cloud path's GitHub-schedules story.
          isDocker={Boolean(process.env.POSTGREST_URL)}
        />
      </div>
    </main>
  );
}
