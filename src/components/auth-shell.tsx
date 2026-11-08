import Link from "next/link";
import { AuthShowcase } from "./auth-showcase";

// Two-column auth layout (DataFast/Postiz pattern): the form column on the
// left, the rotating product showcase on the right. The showcase column
// disappears below lg so phones get the plain centered form.

function HomeArrow() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-4 w-4"
    >
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  // Only cloud has a landing page to go back to. A self-host install's "/"
  // redirects to /dashboard, which bounces a logged-out visitor straight back
  // to /login - so there the link would be a loop, and it stays hidden.
  const hasLanding = process.env.LANDING_ENABLED === "true";

  return (
    <main className="relative flex min-h-screen bg-neutral-950">
      {hasLanding ? (
        <Link
          href="/"
          className="absolute left-4 top-4 z-10 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 lg:left-6 lg:top-6"
        >
          <HomeArrow />
          Home
        </Link>
      ) : null}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-5">{children}</div>
      </div>
      <aside className="hidden items-center justify-center border-l border-neutral-800/60 bg-neutral-900/30 lg:flex lg:w-1/2">
        <AuthShowcase />
      </aside>
    </main>
  );
}
