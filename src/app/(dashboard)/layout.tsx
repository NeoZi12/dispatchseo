import Link from "next/link";
import { MobileNav, PageTitle, Sidebar } from "@/components/nav";
import { DispatchMark } from "@/components/logo";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ModeSwitch } from "@/components/mode-switch";
import { getActiveProjectOrNull, scopedProjects } from "@/lib/active-project";
import { isCloudMode } from "@/lib/cloud";
import { SetupProgressBanner } from "@/components/setup-progress-banner";

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
  const [projects, active] = await Promise.all([scopedProjects(), getActiveProjectOrNull()]);

  const billing = isCloudMode();
  // Cloud unlocks the dashboard as soon as a repo is connected (onboarding-gate),
  // so the owner can explore while the background setup run personalizes their
  // site. Show a top banner in exactly that window - repo connected but the run
  // hasn't stamped pipeline_installed_at yet - so the half-filled dashboard
  // reads as "still setting up", not "broken".
  const setupInProgress =
    billing && active != null && Boolean(active.github_repo) && active.pipeline_installed_at == null;
  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar billing={billing} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/dashboard" className="flex shrink-0 items-center gap-2 md:hidden">
                <DispatchMark className="h-7 w-auto" />
                <span className="font-semibold tracking-tight">DispatchSEO</span>
              </Link>
              {active && (
                <ProjectSwitcher
                  projects={projects.map((p) => ({ slug: p.slug, name: p.name, domain: p.domain }))}
                  activeSlug={active.slug}
                />
              )}
            </div>
            <PageTitle />
            <div className="flex items-center justify-end">
              {active && <ModeSwitch mode={active.mode} />}
            </div>
          </div>
          <div className="px-4 sm:px-6">
            <MobileNav billing={billing} />
          </div>
        </header>
        {setupInProgress && active && (
          <SetupProgressBanner
            slug={active.slug}
            repo={active.github_repo}
            since={active.github_app_installed_at}
          />
        )}
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
