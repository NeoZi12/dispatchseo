// Mirrors src/app/(dashboard)/automations/page.tsx: heading, intro line, and
// a stacked list of automation cards (name/status row, description, flow strip).
export default function AutomationsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-8 w-40 rounded-lg bg-neutral-900" />
        <div className="h-4 w-80 max-w-full rounded-lg bg-neutral-900" />
      </div>
      <div className="h-4 w-full max-w-2xl rounded-lg bg-neutral-900" />
      <div className="space-y-4">
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
        <div className="h-28 rounded-xl border border-neutral-800/80 bg-neutral-900/60" />
      </div>
    </div>
  );
}
