// Mirrors trends/page.tsx: the PageHeader row, the "On the radar" topic
// card grid, the approved build-queue panel, and the Shipped panel.
export default function TrendsLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-8 w-24 rounded-lg bg-neutral-900" />
          <div className="h-4 w-96 rounded-lg bg-neutral-900" />
        </div>
        <div className="h-9 w-28 rounded-lg bg-neutral-900" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-40 rounded-lg bg-neutral-900" />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="h-32 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-32 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-4 w-48 rounded-lg bg-neutral-900" />
        <div className="h-48 rounded-xl bg-neutral-900" />
      </div>
      <div className="space-y-3">
        <div className="h-4 w-20 rounded-lg bg-neutral-900" />
        <div className="h-32 rounded-xl bg-neutral-900" />
      </div>
    </div>
  );
}
