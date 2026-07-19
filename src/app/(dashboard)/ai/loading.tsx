// Mirrors src/app/(dashboard)/ai/page.tsx: heading, 5-tile engine row, the
// larger trend chart, the gap panel, and the query log.
export default function AiVisibilityLoading() {
  return (
    <div className="animate-pulse space-y-8">
      <div className="space-y-3">
        <div className="h-8 w-52 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-24 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-64 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-48 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4">
        <div className="h-4 w-64 rounded-lg bg-neutral-900" />
        <div className="mt-3 divide-y divide-neutral-800/60">
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
          <div className="h-12" />
        </div>
      </div>
    </div>
  );
}
