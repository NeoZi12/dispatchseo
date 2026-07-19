// Mirrors settings/page.tsx: the mx-auto max-w-xl column with the Project
// info panel, keyword source section, project key section, and danger zone.
export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-xl animate-pulse space-y-8">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded-lg bg-neutral-900" />
        <div className="h-4 w-80 rounded-lg bg-neutral-900" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded-lg bg-neutral-900" />
        <div className="h-40 rounded-xl bg-neutral-900" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-40 rounded-lg bg-neutral-900" />
        <div className="h-16 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-28 rounded-lg bg-neutral-900" />
        <div className="h-10 rounded-lg bg-neutral-900" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-24 rounded-lg bg-neutral-900" />
        <div className="h-20 rounded-xl border border-red-500/25 bg-neutral-900" />
      </div>
    </div>
  );
}
