// Mirrors src/app/(dashboard)/instructions/page.tsx: heading + facts strip,
// two hero preview panels (guide/tool), house-rules panel, and the secondary
// workflow strip.
export default function InstructionsLoading() {
  return (
    <div className="animate-pulse space-y-10">
      <div className="space-y-4">
        <div className="h-8 w-40 rounded-lg bg-neutral-900" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-neutral-900" />
        <div className="h-14 rounded-xl bg-neutral-900/60" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-72 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
      <div className="h-40 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      <div className="h-32 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
    </div>
  );
}
