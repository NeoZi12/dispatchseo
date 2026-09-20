import { requireDashboard } from "@/lib/auth-gate";
import { cookies, headers } from "next/headers";
import { isValidDomain } from "@/lib/domain";
import { serviceAccountEmail } from "@/lib/gsc";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { hasConfiguredProject } from "@/lib/onboarding-gate";
import { fetchProjectToken, publishTarget } from "@/lib/projects";
import { connectionSummary } from "@/lib/wordpress-connect";
import { latestQualifier } from "@/lib/qualifier";
import {
  aiKind,
  aiStep,
  firstStepAfterCreate,
  isWizardAiChoice,
  siteStep,
  type PublishChoice,
} from "@/lib/wizard-branch";
import { projectAgent } from "@/lib/agents";
import { requestOrigin } from "@/lib/request-origin";
import { OnboardingWizard, type WizardResume } from "@/components/onboarding-wizard";
import {
  CloudOnboardingWizard,
  type CloudWizardResume,
} from "@/components/cloud-onboarding-wizard";
import { CLOUD_WIZARD_SCREENS, SELF_HOST_WIZARD_SCREENS } from "@/lib/wizard-screens";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { PixelDispatcher } from "@/components/pixel-dispatcher";

export const dynamic = "force-dynamic";
// The c2 credential step live-verifies an OpenAI key against api.openai.com
// with a 20s probe timeout; the platform's default action budget is what a
// slow provider response would otherwise blow through. Settings sets the
// same limit for the same reason.
export const maxDuration = 60;

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
  if (!project) return null;
  // A WordPress project has no repo by design, so "no repo" only means
  // "nothing to resume" for a GitHub one. Returning null here for WordPress
  // restarted the wizard at step 1, where re-submitting the same domain
  // answers "a project for that domain already exists" - a loop with no exit.
  const wordpress = publishTarget(project) === "wordpress";
  if (!project.github_repo && !wordpress) return null;
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
  let screen =
    savedScreen && (SELF_HOST_WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as WizardResume["screen"])
      : "s5";
  // Never resume INTO step 1 - the project exists; land on the next step.
  if (screen === "s0") screen = "s1";
  // s_gh and s_wp are the two branches' versions of one step. A screen saved
  // from the other branch (the target was changed from Settings mid-wizard) is
  // corrected to this branch's - same correction buildCloudResume makes for
  // c1/c1w.
  if (screen === "s_gh" && wordpress) screen = "s_wp";
  if (screen === "s_wp" && !wordpress) screen = "s_gh";
  const wp = connectionSummary(project);
  return {
    screen,
    publishTarget: wordpress ? "wordpress" : "github",
    wp: {
      connected: wp.connected,
      url: wp.url,
      username: wp.username,
      seoPlugin: wp.seo_plugin,
      canPublish: Boolean(wp.capabilities?.publish_posts),
      canUploadMedia: Boolean(wp.capabilities?.upload_files),
    },
    created: {
      slug: project.slug,
      name: project.name,
      domain: project.domain,
      mcpToken,
    },
    choice: project.keyword_source === "dataforseo" ? "paid" : "free",
    serpConnected: project.keyword_source === "serpapi",
    // Through projectAgent() rather than project.agent directly, same as the
    // cloud resume below: a pre-0044 database reads the column back as
    // undefined, and the picker needs a real id to check a radio against.
    agent: projectAgent(project).id,
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
  // Default to c1, NOT c5. The finale auto-fires runPipelineInstall on mount
  // (cloud-onboarding-wizard.tsx), which commits the pipeline pack into the
  // project's repo, writes the SEO_MCP_API_KEY secret, and dispatches a
  // workflow - so "we don't know which screen this project was on" used to
  // resolve to the single most destructive one. Any project that never went
  // through THIS wizard has a null onboarding_screen: every self-host-era
  // project, every row created before screen persistence, every project added
  // outside the wizard. Loading /onboarding then wrote into its repo without
  // anyone pressing a button - it tried to commit into a live clockedcode.com
  // repo and was saved only by that project having no GitHub App installed
  // (2026-07-26). c5 is now reachable only when it was EXPLICITLY saved, i.e.
  // when someone actually walked the wizard to the end.
  // Which of the three setups this project is on. Everything below - the
  // default screen, which stale screens get corrected, whether a missing repo
  // is a problem at all - follows from these two.
  const target = publishTarget(project);
  const kind = aiKind(project.ai_choice);
  const branchDefault = firstStepAfterCreate(target, kind);
  const saved =
    savedScreen && (CLOUD_WIZARD_SCREENS as readonly string[]).includes(savedScreen)
      ? (savedScreen as CloudWizardResume["screen"])
      : branchDefault;
  // Never resume INTO c0 - the project exists. For a GitHub project this is
  // the same "c1" it always was; for the others it is their own first step.
  let screen = saved === "c0" ? branchDefault : saved;

  // A screen saved from the WRONG branch, corrected to this branch's
  // equivalent. It happens for one mundane reason: createProjectCore stamps
  // "c1" on every cloud row at creation, before the wizard's own write records
  // which route the owner picked - so a reload in that window would land a
  // WordPress owner on "Connect GitHub", the screen this whole flow exists to
  // keep them off. Same correction covers a route changed later from Settings.
  const mySite = siteStep(target);
  const myAi = aiStep(target, kind);
  if ((screen === "c1" || screen === "c1w") && screen !== mySite) screen = mySite ?? myAi;
  if ((screen === "c2" || screen === "c2a" || screen === "c2c") && screen !== myAi) screen = myAi;

  // Same reasoning from the other direction, kept as a second gate: c5 requires
  // a connected repo and c2-c4 are only reachable after one is chosen, so with
  // no github_repo the only honest resume is c1. Originally the safety net for
  // lost screen persistence - the "Install the App" link is a full-page
  // navigation that can cancel the in-flight setWizardScreen("c1") POST,
  // leaving onboarding_screen null -> a finale that instantly errored "no repo
  // connected" (2026-07-23). The default above now covers that case too; this
  // stays because a saved c2-c5 on a repo-less project must still land at c1.
  //
  // GITHUB PROJECTS ONLY. WordPress and manual sites have no repo by design,
  // and their site step is skippable on purpose (a WordPress password nobody
  // has to hand must not trap a paying owner on step 1), so forcing them back
  // would be a loop with no exit.
  if (target === "github" && !project.github_repo) screen = "c1";

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

  // The same summary Settings renders from, so "connected" means exactly one
  // thing across the product (a url AND a stored password) and the wizard can
  // never disagree with the screen the owner is sent to next.
  const wp = connectionSummary(project);

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
    // Through projectAgent() rather than project.agent directly: a database
    // that has not run 0044 reads the column back as undefined, and the picker
    // needs a real id to check a radio against.
    agent: projectAgent(project).id,
    publishTarget: target,
    aiChoice: project.ai_choice,
    wpConnected: wp.connected,
    wp: {
      url: wp.url,
      username: wp.username,
      seoPlugin: wp.seo_plugin,
      canPublish: Boolean(wp.capabilities?.publish_posts),
      canUploadMedia: Boolean(wp.capabilities?.upload_files),
    },
    // Fetched here rather than on the two screens that need it because they
    // are client components with no way to read it. Never rendered outside
    // c2a/c2c - the connect command and the connector URL both ARE the key.
    mcpToken: await fetchProjectToken(project.id),
    chatSeen: Boolean(project.chat_last_seen_at),
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

  // The MCP connect command needs this deployment's public origin - one
  // shared rule (request-origin.ts) so the wizard, Settings and the
  // dashboard cards can never disagree about http vs https.
  const h = await headers();
  const origin = requestOrigin(h);

  const isNew = params.new;
  const cloud = isCloudMode();

  // "Add a site" from an owner who already has one belongs in the dashboard,
  // not here: this route is the chrome-less first-run shell, and on cloud the
  // resume below keys off the ACTIVE project, so ?new=1 rendered THAT
  // project's saved screen - typically the c5 finale, which re-fires its
  // pipeline install. /new no longer points here at all; this covers the
  // bookmarked URL. An account that owns nothing still gets the wizard, which
  // is exactly what a first run is.
  if (isNew === "1" && (await scopedProjects()).length > 0) {
    redirect("/dashboard?add=1");
  }

  // Anyone whose setup ISN'T finished gets a way to their billing from here.
  //
  // This route is a chrome-less shell with no sidebar, and every other
  // dashboard page needs a configured project, so the only route to Billing is
  // typing the URL - the cancel button is invisible to precisely the person
  // hunting for it.
  //
  // It used to key on owning ZERO sites, which covered a returning customer who
  // had just deleted their last one but missed the case that actually happens:
  // someone on day one who adds their site, reaches the publishing step, and
  // only there discovers their stack can't work with this at all (Wix,
  // Squarespace, Shopify - named on the signup page, easy to miss). They own a
  // project, so the old condition hid the link from the one person most likely
  // to be looking for it, mid-trial, with a card already on file.
  //
  // hasConfiguredProject covers both: it is false for an account that owns
  // nothing AND for one whose wizard never reached the finale. An established
  // owner adding a second site still has a finished first one, so it stays true
  // for them and they are not invited to go cancel - the original intent.
  // Request-cached, and the dashboard gate already calls it, so this is free.
  const setupUnfinished = cloud && Boolean(auth.user) && !(await hasConfiguredProject());

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
  // The pre-checkout qualifier's answers, which every cloud signup now passes
  // through. It already asked what the site runs on and which AI the owner
  // has, and step 1 asks the same two questions - so it arrives with them
  // answered. Asking twice in one signup reads as "nothing I typed was saved",
  // which is exactly the impression a half-finished setup must avoid.
  const qualified = cloud && auth.user ? await latestQualifier(auth.user.id) : null;
  let prefillDomain = isValidDomain(pending) ? pending : null;
  if (!prefillDomain && qualified?.domain && isValidDomain(qualified.domain)) {
    prefillDomain = qualified.domain;
  }
  // The owner's own answer first (site_kind, asked as a choice since
  // 2026-08-20); older rows fall back to the detector, where WordPress is the
  // only platform we route away from GitHub - its other answers (nextjs,
  // static, unknown, unreachable) all reach checkout on the repo route, and
  // "we could not tell" must keep today's default rather than guess someone
  // onto a route they did not ask for.
  const prefillPublish: PublishChoice =
    qualified?.site_kind === "wordpress" ||
    (!qualified?.site_kind && qualified?.platform === "wordpress")
      ? "wordpress"
      : "github";
  // Only the four the wizard can actually set up. gemini/none never get past
  // the qualifier, and chatgpt has no connector yet - preselecting any of them
  // would check a radio that cannot be submitted.
  const prefillAi =
    qualified?.ai_choice && isWizardAiChoice(qualified.ai_choice) ? qualified.ai_choice : null;

  // Standalone shell on purpose - no sidebar, no dashboard chrome. The
  // owner sees the wizard and only the wizard until setup verifies and
  // unlocks the dashboard (this route lives OUTSIDE the (dashboard) group).
  return (
    <main className="min-h-screen px-5 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-4 sm:gap-5">
            {/* The way OUT of the wizard. ?home=1 matters: a bare "/" bounces
                a signed-in visitor to /dashboard, whose onboarding gate sends
                anyone mid-setup right back here - an exit that loops. Progress
                is saved server-side (onboarding_screen), so leaving is free
                and the next visit resumes where they stood. */}
            <a
              href="/?home=1"
              aria-label="Back to the home page"
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-sm font-medium text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
            >
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline">Home</span>
            </a>
            <a
              href="/?home=1"
              className="flex items-center gap-2.5 text-lg font-semibold text-white transition-opacity hover:opacity-80"
            >
              <DispatchMark className="h-7 w-auto" />
              DispatchSEO
            </a>
          </div>
          <div className="flex items-center gap-4">
            {/* The way out for someone this product turns out not to fit - see
                setupUnfinished above. Only during unfinished setup, so an
                established owner adding a site is not invited to go cancel.
                Deliberately "Manage billing" and deliberately quiet: the ask
                was for a way out, not a cancel button planted mid-flow. */}
            {setupUnfinished ? (
              <a
                href="/billing"
                className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
              >
                Manage billing
              </a>
            ) : null}
            {/* Escape hatch to the plain-English walkthrough. Served by this
                same instance, so it works on localhost installs too. */}
            <a
              href="/docs/setup-wizard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-300"
            >
              Stuck? <span className="hidden sm:inline">Open the </span>quick guide ↗
            </a>
            {/* The other escape hatch: a person, for the half of "stuck" no
                guide covers (Google won't verify, the repo has no workflows
                folder, the token paste 401s). Sits beside the guide because
                this header is the only chrome the wizard has - someone stalled
                on step 3 shouldn't have to finish setup to find the server.
                Brand blue and icon-only on phones, same as the docs header. */}
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#7d87f5] transition-colors hover:text-[#98a0f8]"
            >
              <DiscordMark className="size-4 shrink-0" />
              <span className="hidden sm:inline">Ask on Discord</span>
              <span className="sr-only sm:hidden">Ask on Discord</span>
            </a>
          </div>
        </div>
        {/* The landing hero's dispatcher, already at the desk for this shift.
            Canvas-rendered, so its per-frame redraw never mutates the DOM and
            can't re-trigger page scanners (Translate/Grammarly) that stole
            input focus when this was an SVG. */}
        <PixelDispatcher working className="mx-auto mb-6 w-[min(300px,80vw)]" />
        {cloud ? (
          <CloudOnboardingWizard
            resume={cloudResume}
            prefillDomain={prefillDomain}
            origin={origin}
            prefillPublish={prefillPublish}
            prefillAi={prefillAi}
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
