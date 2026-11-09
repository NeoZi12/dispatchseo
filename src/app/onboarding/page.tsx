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
import { isWizardAiChoice, type PublishChoice } from "@/lib/wizard-branch";
import { projectAgent } from "@/lib/agents";
import { requestOrigin } from "@/lib/request-origin";
import { OnboardingWizard, type WizardResume } from "@/components/onboarding-wizard";
import { CloudOnboardingWizard } from "@/components/cloud-onboarding-wizard";
import { SELF_HOST_WIZARD_SCREENS } from "@/lib/wizard-screens";
import { DispatchMark } from "@/components/logo";
import { DISCORD_URL, DiscordMark } from "@/components/discord-mark";
import { PixelDispatcher } from "@/components/pixel-dispatcher";
import { SetupStepCard, type SiteQualifier } from "@/components/setup-path";
import { getSetupStep } from "@/lib/setup-path";
import { loadSetupCardProps, type SetupCardServerProps } from "@/lib/setup-card-props";
import type { SetupStep } from "@/lib/setup-path-core";
import { buildCloudResume } from "./legacy-resume";
import { cleanFlagText, cleanGscFlag, GENERIC_GITHUB_FLAG } from "@/lib/flag-text";
import { cleanDomain } from "@/lib/domain";
import { buildPlanMenu, isCodeHost, parsePlanPick, readSentCookie, resolveSetupStage } from "@/lib/setup-flow";
import { labelFor } from "@/lib/site-platform";
import { enqueueLaunch } from "@/lib/job-handlers/launch";
import { listInstallationRepos } from "@/lib/github-app";
import { isActive, polarConfigured, priceLabel, productIdForTier, TIER_LIMITS } from "@/lib/billing";
import { claimFreeLaunch, type FreeLaunchResult } from "@/lib/free-gate";
import { clientIp } from "@/lib/login-lockout";
import { DEVICE_COOKIE } from "@/lib/setup-flow";
import { SetupClient, type CheckoutPlan } from "./setup-client";
import { PaymentConfirming } from "@/components/payment-confirming";
import type { SiteVerdict } from "@/components/setup-stage/scenes";

export const dynamic = "force-dynamic";
// The c2 credential step live-verifies an OpenAI key against api.openai.com
// with a 20s probe timeout; the platform's default action budget is what a
// slow provider response would otherwise blow through. Settings sets the
// same limit for the same reason.
export const maxDuration = 60;

// Cloud: the setup path (src/lib/setup-path*.ts + components/setup-path) -
// ONE step at a time through the connect phase, computed server-side from
// evidence; after "You're connected" the owner lives on Home, where the hero
// card carries the launch steps. SETUP_PATH_LEGACY=1 brings back the old
// cloud wizard for one release.
//
// Self-host: the add-a-site wizard: site -> Search Console -> keyword data
// source -> publish mode -> one-tap merge -> timeline -> live finale. /new
// redirects here with ?new=1; the classic form is retired.
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

type OnboardingParams = {
  new?: string;
  gh?: string;
  msg?: string;
  installation_id?: string;
  connected?: string;
  error?: string;
  domain?: string;
  sent?: string;
  checkout?: string;
  plan?: string;
  interval?: string;
};

const NOTICES: Record<string, string> = {
  checkout: "The checkout didn't finish. Want to try again?",
  taken: "That site is already set up on another account. If it's yours, ask on Discord and we'll release it.",
  duplicate: "You already had a plan, so this payment wasn't added to it. We've been alerted and will refund it.",
};

type FreeBlock = Exclude<Extract<FreeLaunchResult, { ok: false }>["reason"], never>;

/** The free plan's gate for this launch, or null to go ahead. */
async function freeLaunchBlocked(userId: string, email: string | null, project: { id: string; domain: string; github_repo: string | null }): Promise<FreeBlock | null> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  const logins: string[] = [];
  const repoOwner = project.github_repo?.split("/")[0];
  if (repoOwner) logins.push(repoOwner);
  try {
    const { data } = await db().auth.admin.getUserById(userId);
    for (const id of data?.user?.identities ?? []) {
      const name = (id.identity_data as { user_name?: string } | undefined)?.user_name;
      if (id.provider === "github" && name) logins.push(name);
    }
  } catch {
    // The repo owner still counts.
  }
  const result = await claimFreeLaunch({
    ownerId: userId,
    projectId: project.id,
    domain: project.domain,
    email,
    githubLogins: logins,
    ip: clientIp(h) || null,
    device: jar.get(DEVICE_COOKIE)?.value ?? null,
  });
  return result.ok ? null : result.reason;
}

const FREE_BLOCK_LINE: Record<FreeBlock, string> = {
  domain: "This site has already had the free plan.",
  email: "This email has already been used for a free site.",
  github: "This GitHub account has already been used for a free site.",
  device: "This browser has already set up a free site.",
  ip: "A free site was set up from this network recently.",
  disposable: "The free plan needs a real email address, not a throwaway one.",
  error: "We couldn't check the free plan just now. Reload in a minute, or pick a plan to start right away.",
};

/** The gate said no: one honest line, and the way forward is a paid plan. */
function FreePlanUsed({ reason, domain }: { reason: FreeBlock; domain: string }) {
  return (
    <main className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">{reason === "error" ? "One moment" : "The free plan is used up here"}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{FREE_BLOCK_LINE[reason]}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">
            Starter publishes a new article on {domain} every week, with keyword research and rankings.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="/api/polar/checkout?tier=starter&flow=setup"
              className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3 text-[15px] font-semibold text-white hover:brightness-110"
            >
              Choose Starter · {priceLabel(TIER_LIMITS.starter.price)}/month
            </a>
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="text-[14px] text-ink-faint underline underline-offset-4 hover:text-ink">
              Think this is wrong? Ask on Discord
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

// The cloud setup (lib/setup-flow.ts). Which scene shows is derived from
// evidence on every visit - session, project, plan pick, subscription, repo,
// Google grant - so coming back from GitHub, Google, Polar or a sign-in link
// always lands on the next unfinished step. ?plan=growth&interval=year is a
// paid plan picked on the pricing page.
async function cloudSetupFlow(params: OnboardingParams) {
  if (process.env.SETUP_PATH_LEGACY === "1") return null;
  if (params.gh === "pick_project" && params.installation_id) return null;
  const s = await resolveSetupStage(parsePlanPick(params.plan, params.interval));
  if (s.legacy) return null;
  if (params.new === "1" && s.user && s.project?.setup_connected_at) redirect("/dashboard?add=1");
  // A plan picked on the pricing page by someone whose setup is already done
  // (a free site upgrading): straight to that checkout, or to Billing when a
  // plan is already live. Never silently dropped on the dashboard.
  const urlPick = parsePlanPick(params.plan, params.interval);
  if (urlPick && s.user && s.stage === "done") {
    redirect(isActive(s.sub) ? "/billing" : `/api/polar/checkout?tier=${urlPick.tier}&interval=${urlPick.interval}`);
  }

  if (s.stage === "done" && s.project) {
    if (!s.project.setup_connected_at && !isActive(s.sub) && polarConfigured()) {
      // A FREE site's launch is where our spending starts, so the free plan's
      // abuse gate runs here, once, before the stamp (lib/free-gate.ts).
      const blocked = await freeLaunchBlocked(s.user!.id, s.user!.email, s.project);
      if (blocked) return <FreePlanUsed reason={blocked} domain={s.project.domain} />;
    }
    if (!s.project.setup_connected_at) {
      // One conditional write claims the moment, the same way
      // completeConnectPhase does: only the request that flipped the null
      // queues the launch, so a double load can't queue two.
      const { data: stamped } = await db()
        .from("projects")
        .update({ setup_connected_at: new Date().toISOString(), onboarding_screen: "c5" })
        .eq("id", s.project.id)
        .is("setup_connected_at", null)
        .select("id");
      if (stamped && stamped.length > 0) {
        try {
          await enqueueLaunch(s.project.id);
        } catch (e) {
          console.warn(`[onboarding] launch for ${s.project.slug} not queued: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      redirect("/dashboard");
    }
    // Callback flags from a launch-phase install ride along to Home.
    const forwarded = new URLSearchParams();
    for (const k of ["gh", "msg", "connected", "error"] as const) {
      const v = params[k];
      if (v) forwarded.set(k, v);
    }
    const qs = forwarded.toString();
    redirect(qs ? `/dashboard?${qs}` : "/dashboard");
  }

  const stage = s.stage === "done" ? "address" : s.stage;
  const fromUrl = cleanDomain(params.domain ?? "");
  const prefill = s.project?.domain ?? fromUrl ?? "";
  // The cookie's answer is shown again only for the address it was for.
  const initialVerdict: SiteVerdict =
    s.site && s.site.domain === (prefill || s.site.domain)
      ? s.site.taken
        ? { kind: "refused", platform: "taken" }
        : !s.site.ok
        ? { kind: "refused", platform: labelFor(s.site.platform) }
        : s.site.override
          ? { kind: "ok", framework: null, host: s.site.host, hasBlog: s.site.hasBlog }
          : (s.site.platform === "unknown" || s.site.platform === "unreachable") && !isCodeHost(s.site.host)
            ? { kind: "unknown" }
            : { kind: "ok", framework: s.site.framework, host: s.site.host, hasBlog: s.site.hasBlog }
      : { kind: "idle" };

  let repos: string[] | null = null;
  if (stage === "github" && s.project?.github_installation_id) {
    try {
      repos = (await listInstallationRepos(s.project.github_installation_id)).map((r) => r.full_name);
    } catch {
      repos = null;
    }
  }
  const gsc = cleanGscFlag(params.connected, params.error);
  // Sent a sign-in link from the account step (this browser's cookie).
  const sent = s.user ? null : await readSentCookie();
  const notice = params.error && NOTICES[params.error] ? NOTICES[params.error] : null;
  // Back from Polar before the plan row exists (no subscription id on the
  // checkout yet): wait for it here.
  const waitingForPlan = params.checkout === "success" && Boolean(s.user) && !isActive(s.sub) && (stage === "address" || stage === "checkout");

  // The paid pick to preselect. A yearly pick on a deployment without that
  // yearly product is preselected (and sold) monthly rather than
  // advertising a price nobody can pay.
  const checkoutPlan: CheckoutPlan | null = s.checkoutPlan
    ? { tier: s.checkoutPlan.tier, interval: s.checkoutPlan.interval === "year" && productIdForTier(s.checkoutPlan.tier, "year") ? "year" : "month" }
    : null;
  const planMenu = stage === "checkout" ? buildPlanMenu(s.freeOpen) : null;

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5 sm:px-6">
        <a href="/?home=1" className="flex items-center gap-2.5 text-[16px] font-semibold text-ink transition-opacity hover:opacity-80">
          <DispatchMark className="h-6 w-auto" />
          DispatchSEO
        </a>
        <nav className="flex items-center gap-4 text-[13.5px] text-ink-faint">
          {s.user ? (
            s.sub ? <a href="/billing" className="hover:text-ink">Manage billing</a> : null
          ) : (
            <a href="/login" className="hover:text-ink">Sign in</a>
          )}
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink">
            <DiscordMark className="size-4 shrink-0" />
            <span className="hidden sm:inline">Ask on Discord</span>
            <span className="sr-only sm:hidden">Ask on Discord</span>
          </a>
        </nav>
      </header>
      {waitingForPlan ? (
        <div className="mx-auto w-full max-w-md px-4 py-16">
          <PaymentConfirming />
        </div>
      ) : (
      <SetupClient
        // Remount on every step change: the client holds the scene and busy
        // flags, and a router.refresh() that moves to the next step must not
        // keep the last step's state (review, 2026-11-08).
        key={stage}
        stage={stage}
        slug={s.project?.slug ?? null}
        domain={s.project?.domain ?? s.site?.domain ?? null}
        prefill={prefill || s.site?.domain || ""}
        initialVerdict={initialVerdict}
        signedIn={Boolean(s.user)}
        checkoutPlan={checkoutPlan}
        planStep={s.planStep}
        planMenu={planMenu}
        sentTo={sent?.to ?? null}
        repos={repos}
        ghError={params.gh === "error" ? (cleanFlagText(params.msg) ?? GENERIC_GITHUB_FLAG) : null}
        googleError={stage === "google" && !notice && gsc && gsc !== "connected" ? `Google didn't connect (${gsc}). Try again.` : null}
        notice={notice}
      />
      )}
    </main>
  );
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
    domain?: string;
    sent?: string;
    plan?: string;
    interval?: string;
  }>;
}) {
  const params = await searchParams;
  // Cloud: the one setup flow (site -> account -> [checkout] -> GitHub ->
  // Google), open to a
  // visitor with no account yet. Null = this visitor belongs on the older
  // path below (an agent-writer project mid-setup, SETUP_PATH_LEGACY, the
  // github.com install chooser).
  if (isCloudMode()) {
    const page = await cloudSetupFlow(params);
    if (page) return page;
  }
  const auth = await requireDashboard();

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
  // The old cloud wizard, kept one release behind SETUP_PATH_LEGACY=1
  // (decision 7). Everything cloud below this line is the setup path.
  const legacy = cloud && process.env.SETUP_PATH_LEGACY === "1";
  const cloudResume = legacy ? await buildCloudResume() : null;

  // The setup path: the active project's connect phase, one step at a time.
  // A project past it (setup_connected_at) belongs on Home, where the hero
  // carries its launch steps - and every GitHub App callback exit lands HERE
  // (/onboarding?gh=…), including the launch-phase let_us_publish /
  // reconnect_app installs, so the callback flags ride along verbatim for the
  // hero to render [R8]. ?new=1 with an existing project already left for
  // /dashboard?add=1 above.
  const pathProject = cloud && !legacy ? await getActiveProjectOrNull() : null;
  if (pathProject?.setup_connected_at && !isNew) {
    const forwarded = new URLSearchParams();
    for (const k of ["gh", "msg", "connected", "error"] as const) {
      const v = params[k];
      if (v) forwarded.set(k, v);
    }
    const qs = forwarded.toString();
    redirect(qs ? `/dashboard?${qs}` : "/dashboard");
  }

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
    qualified?.ai_choice && isWizardAiChoice(qualified.ai_choice, { allowHosted: cloud }) ? qualified.ai_choice : null;
  // The same two answers, in the shape the setup path's `site` step reads:
  // its one-line summary ("WordPress site · written by the Claude app ·
  // change"), and the branch the rail's dot count follows before a project
  // row exists. No qualifier row = null, which opens the "change" expander.
  const pathQualifier: SiteQualifier = qualified
    ? { publish_target: prefillPublish, ai_choice: prefillAi }
    : null;

  let pathStep: SetupStep | null = null;
  let pathProps: SetupCardServerProps | null = null;
  if (cloud && !legacy) {
    pathStep = pathProject
      ? await getSetupStep(pathProject, origin, { live: true })
      : await getSetupStep(null, origin, {
          live: true,
          branchHint: qualified ? { publish_target: prefillPublish, ai_choice: prefillAi } : null,
        });
    pathProps = pathProject ? await loadSetupCardProps(pathProject, pathStep) : null;
  }

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
                is saved server-side (the setup path derives its step from
                evidence on cloud; onboarding_screen on self-host), so leaving
                is free and the next visit resumes where they stood. */}
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
        {/* Not on the setup path: its card has its own dispatcher, idle on a
            "do" step and working on a wait [R23]. */}
        {pathStep ? null : (
          <PixelDispatcher working className="mx-auto mb-6 w-[min(300px,80vw)]" />
        )}
        {pathStep ? (
          <SetupStepCard
            step={pathStep}
            mode="screen"
            slug={pathProject?.slug ?? null}
            origin={origin}
            agentId={pathProps?.agentId ?? null}
            token={pathProps?.token ?? null}
            wp={pathProps?.wp ?? null}
            repos={pathProps?.repos ?? null}
            gscSites={pathProps?.gscSites ?? null}
            gscSiteUrl={pathProps?.gscSiteUrl ?? null}
            qualifier={pathQualifier}
            prefillDomain={prefillDomain}
            ghFlag={params.gh ?? null}
            ghError={cleanFlagText(params.msg)}
            gscFlag={cleanGscFlag(params.connected, params.error)}
            serverNow={Date.now()}
          />
        ) : cloud ? (
          <CloudOnboardingWizard
            resume={cloudResume}
            prefillDomain={prefillDomain}
            origin={origin}
            prefillPublish={prefillPublish}
            prefillAi={prefillAi}
            ghFlag={params.gh ?? null}
            ghError={cleanFlagText(params.msg)}
            gscFlag={cleanGscFlag(params.connected, params.error)}
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
