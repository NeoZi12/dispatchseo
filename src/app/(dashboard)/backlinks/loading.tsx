// Mirrors src/app/(dashboard)/backlinks/page.tsx: header + progress meter,
// two-column free/paid item-card lists, and the backlink prospects table.
export default function BacklinksLoading() {
  return (
    <div className="animate-pulse space-y-10">
      <div className="space-y-4">
        <div className="h-8 w-56 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
        <div className="h-3 w-44 rounded-full bg-neutral-900" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        </div>
        <div className="space-y-3">
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
          <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        </div>
      </div>
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4">
        <div className="h-4 w-24 rounded-lg bg-neutral-900" />
        <div className="mt-3 divide-y divide-neutral-800/60">
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
