// Instant route-transition feedback for every dashboard screen. Renders
// inside the group layout (sidebar + topbar stay put) the moment a nav link
// is clicked, while the force-dynamic page fetches its data.
export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-6xl animate-pulse space-y-6 p-4 sm:p-6">
      <div className="h-8 w-48 rounded-lg bg-neutral-900" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-64 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
    </div>
  );
}
