"use client";

// Global error boundary - the "unknown unknowns" net. Every dashboard data
// provider degrades on its own (the 2026-07-20 reliability audit traced all
// mid-setup states through every page without finding a crash path), so this
// should never render; if something new does throw, the owner gets a calm
// retry screen instead of Next's bare stack page.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-center">
        <h2 className="text-lg font-semibold text-neutral-100">Something broke on this page</h2>
        <p className="text-sm text-neutral-400">
          The rest of the dashboard is unaffected and no automation is impacted - this is a
          rendering error only. Try again; if it keeps happening, the message below is what to
          report.
        </p>
        <p className="rounded bg-neutral-950 px-3 py-2 font-mono text-xs text-neutral-500">
          {error.message || "unknown error"}
          {error.digest ? ` (digest ${error.digest})` : ""}
        </p>
        <button
          onClick={reset}
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
