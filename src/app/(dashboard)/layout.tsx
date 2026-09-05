import Link from "next/link";
import { cookies } from "next/headers";
import { MobileNav, PageTitle, Sidebar } from "@/components/nav";
import { DispatchMark } from "@/components/logo";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ModeSwitch } from "@/components/mode-switch";
import { AgentHeaderSwitch } from "@/components/agent-header-switch";
import { DEFAULT_AGENT, projectAgent } from "@/lib/agents";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { currentUser } from "@/lib/cloud-auth";
import { SetupProgressBanner } from "@/components/setup-progress-banner";
import { RepoCleanupBanner } from "@/components/repo-cleanup-banner";
import { PlanLapsedBanner } from "@/components/plan-lapsed-banner";
import { getSubscription, planBadge, planNotice, sitesRemaining } from "@/lib/billing";
import { githubCostGate } from "@/lib/github-cost-gate";
import { REPO_NOTICE_COOKIE, decodeRepoNotice } from "@/lib/repo-notice";
import { PostHogIdentify } from "@/components/posthog-identify";

// Shared shell for every dashboard screen. Auth is checked per page (the
// requireDashboard gate in auth-gate.ts) - this layout is presentation only. force-dynamic
// covers the whole group: everything behind the password gate is
// per-request, and it keeps `next build` from prerendering pages that read
// the DB (CI's build-verify runs with no env at all).
export const dynamic = "force-dynamic";
// Vercel-style chrome: a full-height icon sidebar owns the left edge (brand
// at the top),
// and the topbar (project switcher / centered page title) only spans the
// content column, so the sidebar visually cuts through it. Mobile hides the
// sidebar, shows the brand in the topbar, and swaps in a horizontal nav.

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // scopedProjects: only the signed-in user's projects in CLOUD_MODE. active
  // is null for a cloud account with no projects yet - the page itself
  // redirects to the wizard (getActiveProject), the layout just renders a
  // chrome without switcher/mode for that one request.
  const [projects, active, jar, user] = await Promise.all([
    scopedProjects(),
    getActiveProjectOrNull(),
    cookies(),
    currentUser(),
  ]);

  const billing = isCloudMode();
  // One indexed single-row read, cloud only, and it can't join the Promise.all
  // above because it needs the user id that call resolves. Worth the round trip:
  // this is the only thing on the dashboard that can explain why a paused
  // account's data stopped moving, and it has to be on every screen, not just
  // the one the owner happens to open.
  const sub = billing && user ? await getSubscription(user.id) : null;
  const notice = planNotice(sub);
  // Which plan this account is on, shown on the Billing row of the sidebar (and
  // the mobile drawer) so the tier is legible from every screen instead of only
  // from /billing. Free-standing from the banner above: that one only appears
  // when something is WRONG, and "which plan am I on" is a question people ask
  // when everything is fine.
  const badge = planBadge(sub);
  // Plan headroom for the switcher's add-project row - computed from the
  // subscription and the project list this layout already loaded, so the
  // "Upgrade to add more sites" state costs no extra query. Same arithmetic the
  // creation gate uses (see sitesRemaining), so the two can't drift apart.
  const sitesLeft = billing && user ? sitesRemaining(sub, projects.length) : null;
  // Third-site GitHub Actions cost step. Cheap by construction: the
  // subscription is already memoized from the planNotice read above and the
  // project count is in hand, so this adds no query. The expensive half -
  // proving the owner's repos are public - runs only when someone actually
  // picks that answer, inside the server action, never on a dashboard render.
  const githubCost =
    billing && user ? await githubCostGate(user.id, projects.length) : { required: false as const };
  // Cloud unlocks the dashboard when the wizard reaches its finale
  // (onboarding-gate keys on the c5 stamp), so the owner can explore while
  // the background setup run personalizes their site. Show a top banner in
  // exactly that window - finale reached but the run hasn't stamped
  // pipeline_installed_at yet - so the half-filled dashboard reads as
  // "still setting up", not "broken".
  // Top progress banner: during setup (pipeline not installed yet) AND the
  // first-data window after install, while the auto-fired research + rank checks
  // are still landing. BOTH branches are time-bounded so long-established
  // projects don't mount a permanent polling banner on every load; the banner
  // itself also hides the moment ideas + a rank check exist.
  const POST_INSTALL_WINDOW = 6 * 3_600_000; // first-data window after install
  const SETUP_WINDOW = 24 * 3_600_000; // an install that hasn't landed in a day isn't "in progress"
  const installedAt = active?.pipeline_installed_at
    ? new Date(active.pipeline_installed_at).getTime()
    : null;
  // When onboarding actually began: the GitHub App install, else the project's
  // creation. A legacy/default project (repo connected before pipeline_installed_at
  // tracking existed, so it stayed null) and a long-abandoned setup both have an
  // OLD clock here - so the null-installed branch below no longer treats them as
  // "still setting up" and no longer shows the banner forever.
  const setupStartedAt = active?.github_app_installed_at
    ? new Date(active.github_app_installed_at).getTime()
    : active?.created_at
      ? new Date(active.created_at).getTime()
      : null;
  // Both modes, since 2026-08-06: self-host used to be excluded (billing &&),
  // which meant adding a SECOND self-host site exited the wizard into a
  // silent dashboard - the any-project gate never re-locks, the cards read as
  // clutter, and nothing said "this site isn't publishing yet". The component
  // renders mode-appropriate copy (self-host setup waits on the owner's
  // install command; nothing runs "in the background" until it's run).
  const setupInProgress =
    active != null &&
    Boolean(active.github_repo) &&
    (installedAt != null
      ? Date.now() - installedAt < POST_INSTALL_WINDOW
      : setupStartedAt != null && Date.now() - setupStartedAt < SETUP_WINDOW);
  // No release bar here any more. "DispatchSEO has been updated" used to run
  // under the topbar on every screen until dismissed, on top of whatever Home
  // was already saying - one more banner on every install the morning after a
  // release. It now lives in one place: the dispatcher's briefing on Home
  // (briefing.release), where the agent reports its own upgrade in its own
  // voice, with the same dismissal. The /changelog page is always a click away.
  // One-shot, set by a project delete whose repo teardown only partly landed.
  // Outranks both banners below: it's the only one reporting something the
  // owner may still need to go switch off.
  const repoNotice = decodeRepoNotice(jar.get(REPO_NOTICE_COOKIE)?.value);
  // The pixel dispatcher's dress follows the active project's agent: clay
  // (its default) stays untinted, every other agent resolves from its
  // registry entry. Two CSS variables on the shell, doing different jobs:
  // --dispatcher-agent carries the ID, and the character's palette resolves
  // from the registry inside paletteFor - so the two paths cannot drift.
  // --dispatcher-body stays for the SURFACES tinted to match the agent (the
  // briefing card's glow and speech rule read it directly as a colour).
  // Stamped here because loading screens render synchronously and can't ask
  // which project is active.
  const activeAgent = active ? projectAgent(active) : null;
  const dispatcherTint =
    activeAgent && activeAgent.id !== DEFAULT_AGENT
      ? ({
          "--dispatcher-agent": activeAgent.id,
          "--dispatcher-body": activeAgent.mascot.body,
        } as React.CSSProperties)
      : undefined;
  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100" style={dispatcherTint}>
      {user && <PostHogIdentify userId={user.id} email={user.email} />}
      <Sidebar billing={billing} hasProject={active != null} plan={badge} />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* One row on every size. Desktop keeps the three-up grid (switcher /
            centered title / mode). Mobile can't: at 390px the centered title
            landed on top of the project domain, so it drops out there - the
            page's own h1 already names the screen - and the hamburger takes
            its place on the left. The wordmark also goes; the mark alone links
            home and the drawer carries the full brand. */}
        <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
          <div className="flex h-14 items-center gap-2 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr]">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none md:gap-2">
              <MobileNav billing={billing} hasProject={active != null} plan={badge} />
              <Link href="/dashboard" className="shrink-0 md:hidden" aria-label="DispatchSEO home">
                <DispatchMark className="h-7 w-auto" />
              </Link>
              {active && (
                <ProjectSwitcher
                  projects={projects.map((p) => ({ slug: p.slug, name: p.name, domain: p.domain }))}
                  activeSlug={active.slug}
                  cloud={billing}
                  sitesRemaining={sitesLeft}
                  githubCostRequired={githubCost.required}
                />
              )}
            </div>
            <div className="hidden md:block">
              <PageTitle />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              {/* Agent first, then mode: "who builds" reads before "how much
                  gets published without me", matching the order the two
                  decisions are made in. */}
              {/* Keyed by project: the layout never remounts on a project
                  switch, and every bit of this component's state (fetched
                  statuses, an open key form, the post-switch reminder) is
                  about ONE project - carrying it across would show project
                  A's reminder while B is active. */}
              {active && (
                <AgentHeaderSwitch
                  key={active.slug}
                  current={projectAgent(active).id}
                  slug={active.slug}
                />
              )}
              {active && <ModeSwitch mode={active.mode} slug={active.slug} />}
            </div>
          </div>
        </header>
        {/* Outranks every other banner. The rest report things that happened;
            this reports that the product is not currently running, which makes
            a release note or a setup-progress bar beside it noise. */}
        {notice ? (
          <PlanLapsedBanner notice={notice} />
        ) : repoNotice ? (
          <RepoCleanupBanner repo={repoNotice.repo} warnings={repoNotice.warnings} />
        ) : setupInProgress && active ? (
          <SetupProgressBanner
            slug={active.slug}
            repo={active.github_repo}
            since={active.github_app_installed_at}
            installed={active.pipeline_installed_at != null}
            cloud={billing}
          />
        ) : null}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
