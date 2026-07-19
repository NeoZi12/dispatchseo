import Link from "next/link";
import { MobileNav, PageTitle, Sidebar } from "@/components/nav";
import { DispatchMark } from "@/components/logo";
import { ProjectSwitcher } from "@/components/project-switcher";
import { ModeSwitch } from "@/components/mode-switch";
import { getActiveProject } from "@/lib/active-project";
import { listProjects } from "@/lib/projects";

// Shared shell for every dashboard screen. Auth is checked per page (the
// isValidCookie pattern) - this layout is presentation only. force-dynamic
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
  const [projects, active] = await Promise.all([listProjects(), getActiveProject()]);

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-neutral-800/80 bg-neutral-950/90 backdrop-blur">
          <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Link href="/dashboard" className="flex shrink-0 items-center gap-2 md:hidden">
                <DispatchMark className="h-7 w-auto" />
                <span className="font-semibold tracking-tight">DispatchSEO</span>
              </Link>
              <ProjectSwitcher
                projects={projects.map((p) => ({ slug: p.slug, name: p.name, domain: p.domain }))}
                activeSlug={active.slug}
              />
            </div>
            <PageTitle />
            <div className="flex items-center justify-end">
              <ModeSwitch mode={active.mode} />
            </div>
          </div>
          <div className="px-4 sm:px-6">
            <MobileNav />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
