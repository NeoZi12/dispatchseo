// Mirrors pages/page.tsx: PageHeader, a 3-tile StatRow, and the guides table
// (7 columns).
export default function PagesLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-24 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 rounded-lg bg-neutral-900" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60">
        <div className="h-10 rounded-t-xl bg-neutral-900" />
        <div className="divide-y divide-neutral-800/60">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-neutral-900/40" />
          ))}
        </div>
      </div>
    </div>
  );
}
