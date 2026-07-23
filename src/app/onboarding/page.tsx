import { requireDashboard } from "@/lib/auth-gate";
import { cookies, headers } from "next/headers";
import { isValidDomain } from "@/lib/domain";
import { serviceAccountEmail } from "@/lib/gsc";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { fetchProjectToken } from "@/lib/projects";
import { OnboardingWizard, type WizardResume } from "@/components/onboarding-wizard";
import {
  CloudOnboardingWizard,
  type CloudWizardResume,
} from "@/components/cloud-onboarding-wizard";
import { CLOUD_WIZARD_SCREENS, SELF_HOST_WIZARD_SCREENS } from "@/lib/wizard-screens";
import { DispatchMark } from "@/components/logo";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

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
  // OrNull: a fresh cloud account owns no project yet - that's a clean
  // start-at-step-1, not an error (and getActiveProject would redirect
  // right back here, looping).
  const project = await getActiveProjectOrNull();
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
    savedScreen && (SELF_HOST_WIZARD_SCREENS as readonly string[]).includes(savedScreen)
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

// The cloud wizard's resume: everything c0-c5 needs to re-render mid-flow
// after a reload or an external roundtrip (App install, Google OAuth). Live
// GitHub/Google lists are fetched only in the states that render a picker,
// and every remote read fails soft - resume is a nicety, never a blocker.
async function buildCloudResume(): Promise<CloudWizardResume | null> {
  const project = await getActiveProjectOrNull();
  if (!project) return null;
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
  const saved =
    savedScreen && (CLOUD_WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as CloudWizardResume["screen"])
      : "c5";
  const screen = saved === "c0" ? "c1" : saved;

  let installationRepos: string[] | null = null;
  if (project.github_installation_id && !project.github_repo) {
    try {
      const { listInstallationRepos } = await import("@/lib/github-app");
      installationRepos = (await listInstallationRepos(project.github_installation_id)).map(
        (r) => r.full_name,
      );
    } catch {
      installationRepos = null;
    }
  }

  let gscSites: string[] | null = null;
  if (project.gsc_oauth_refresh_token) {
    try {
      const { oauthListSites } = await import("@/lib/gsc-oauth");
      gscSites = (await oauthListSites(project.gsc_oauth_refresh_token)).map((s) => s.siteUrl);
    } catch {
      gscSites = null;
    }
  }

  return {
    screen,
    created: { slug: project.slug, name: project.name, domain: project.domain },
    githubRepo: project.github_repo,
    installationId: project.github_installation_id,
    installationRepos,
    gscConnected: Boolean(project.gsc_oauth_refresh_token),
    gscSites,
    gscSiteUrl: project.gsc_site_url,
    mode: project.mode,
  };
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{
    new?: string;
    checkout?: string;
    gh?: string;
    msg?: string;
    installation_id?: string;
    connected?: string;
    error?: string;
  }>;
}) {
  const auth = await requireDashboard();
  const params = await searchParams;

  // Cloud: plan before site. A fresh account with no subscription pays
  // first (/plans - a standalone pricing page, no dashboard chrome), then
  // comes back here; project creation enforces the same rule server-side,
  // this is just the honest front door.
  if (isCloudMode() && auth.user) {
    const [{ getSubscription, isActive }, mine] = await Promise.all([
      import("@/lib/billing"),
      scopedProjects(),
    ]);
    if (mine.length === 0 && !isActive(await getSubscription(auth.user.id))) {
      // Fresh from Polar checkout, webhook not landed yet: absorb the race
      // instead of bouncing someone who JUST paid back to /plans. A short
      // server-side retry catches the common sub-second webhook; the
      // confirming screen's poll covers the rest.
      if (params.checkout === "success") {
        let active = false;
        for (let i = 0; i < 3 && !active; i++) {
          await new Promise((r) => setTimeout(r, 700));
          active = isActive(await getSubscription(auth.user.id));
        }
        if (!active) {
          const { PaymentConfirming } = await import("@/components/payment-confirming");
          return (
            <main className="min-h-screen px-5 py-8 sm:px-6 sm:py-10">
              <PaymentConfirming />
            </main>
          );
        }
      } else {
        redirect("/plans");
      }
    }
  }

  // The MCP connect command needs this deployment's public origin. Behind
  // Vercel the forwarded headers are trustworthy; localhost falls out naturally.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const isNew = params.new;
  const cloud = isCloudMode();

  // Someone installed the App straight from github.com - no signed state, so
  // the callback couldn't tie it to a project. Interrupt with a chooser over
  // this user's installation-less projects, then resume the wizard normally.
  if (cloud && params.gh === "pick_project" && params.installation_id) {
    const installationId = Number(params.installation_id);
    const candidates = (await scopedProjects()).filter((p) => !p.github_installation_id);
    if (Number.isSafeInteger(installationId) && candidates.length > 0) {
      const { attachGithubInstallation } = await import("@/app/actions");
      return (
        <main className="min-h-screen px-5 py-8 sm:px-6 sm:py-10">
          <div className="mx-auto w-full max-w-md">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              You installed the DispatchSEO GitHub App
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-400">
              Which of your sites is it for?
            </p>
            <div className="mt-5 space-y-2.5">
              {candidates.map((p) => (
                <form key={p.id} action={attachGithubInstallation.bind(null, p.slug, installationId)}>
                  <button
                    type="submit"
                    className="w-full cursor-pointer rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-left transition-colors hover:border-violet-500/40"
                  >
                    <span className="block font-medium text-neutral-100">{p.name}</span>
                    <span className="block text-sm text-neutral-500">{p.domain}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        </main>
      );
    }
  }
  const resume = cloud || isNew === "1" ? null : await buildResume();
  // ?new=1 still resumes on cloud when a project already exists - the App
  // install and OAuth callbacks land here mid-flow, and "start fresh" only
  // means anything before a project row exists (createProjectCore enforces
  // the site cap regardless).
  const cloudResume = cloud ? await buildCloudResume() : null;

  // The domain typed into the landing hero (stashed by /signup) prefills
  // step 1, so nobody types their domain twice.
  const pending = (await cookies()).get("pending_domain")?.value ?? "";
  const prefillDomain = isValidDomain(pending) ? pending : null;

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
          {/* Escape hatch to the plain-English walkthrough. Served by this
              same instance, so it works on localhost installs too. */}
          <a
            href="/docs/setup-wizard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Stuck? Open the quick guide ↗
          </a>
        </div>
        {/* The landing hero's dispatcher, already at the desk for this site's
            shift - `working` skips the walk-in so a re-render can't restart it. */}
        <PixelDispatcher working className="mx-auto mb-6 w-[min(300px,80vw)]" />
        {cloud ? (
          <CloudOnboardingWizard
            resume={cloudResume}
            prefillDomain={prefillDomain}
            ghFlag={params.gh ?? null}
            ghError={params.msg ?? null}
            gscFlag={params.connected === "1" ? "connected" : (params.error ?? null)}
          />
        ) : (
          <OnboardingWizard
            saEmail={await serviceAccountEmail()}
            origin={origin}
            resume={resume}
            prefillDomain={prefillDomain}
            // Docker marker: the compose stack talks to Postgres through
            // PostgREST. Docker installs get builder guidance (in-stack
            // builds) instead of the cloud path's GitHub-schedules story.
            isDocker={Boolean(process.env.POSTGREST_URL)}
          />
        )}
      </div>
    </main>
  );
}
