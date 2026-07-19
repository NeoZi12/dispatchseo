// Mirrors src/app/(dashboard)/analytics/page.tsx: heading, Domain Rating
// card, traffic chart + stat row, traffic-by-page panel, guide/tool traffic
// tables, and the rankings + top-queries tables.
export default function AnalyticsLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
      </div>
      <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="space-y-4">
        <div className="h-64 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        </div>
      </div>
      <div className="h-48 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-56 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-56 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-72 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-56 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
    </div>
  );
}
