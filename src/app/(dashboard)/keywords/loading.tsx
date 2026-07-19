// Mirrors src/app/(dashboard)/keywords/page.tsx: heading, 4-tile stat row,
// and the keyword rankings table.
export default function KeywordsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-8 w-48 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4">
        <div className="h-4 w-64 rounded-lg bg-neutral-900" />
        <div className="mt-3 divide-y divide-neutral-800/60">
          <div className="h-10" />
          <div className="h-10" />
          <div className="h-10" />
          <div className="h-10" />
          <div className="h-10" />
          <div className="h-10" />
          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
