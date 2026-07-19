// Mirrors src/app/(dashboard)/dashboard/page.tsx (Home): heading, journey
// card, stat row, setup-cards grid, traffic graph, traffic-by-page panel,
// analytics teaser, AI visibility teaser card, trend radar, next-actions
// grid, backlink playbook, and activity grid.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-8 w-32 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
      </div>
      <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="grid gap-4 md:grid-cols-4">
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-64 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-48 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      {/* AI visibility teaser - one clickable card (engine numbers + trend +
          gap list), not the separate tile row it used to be. */}
      <div className="h-64 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-48 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-32 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-32 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-48 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
    </div>
  );
}
