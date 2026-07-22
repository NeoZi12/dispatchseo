import { AuthShowcase } from "./auth-showcase";

// Two-column auth layout (DataFast/Postiz pattern): the form column on the
// left, the rotating product showcase on the right. The showcase column
// disappears below lg so phones get the plain centered form.

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen bg-neutral-950">
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm space-y-4">{children}</div>
      </div>
      <aside className="hidden items-center justify-center border-l border-neutral-800/60 bg-neutral-900/30 lg:flex lg:w-1/2">
        <AuthShowcase />
      </aside>
    </main>
  );
}
