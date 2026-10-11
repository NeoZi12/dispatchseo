// This site's own Search Console impressions per day, 2026-09-13 to
// 2026-10-09, read with get_site_stats while writing this guide. Every value is
// printed as text under the bar; the bars are decoration. It shows what the
// zero-authority start looks like in data: mostly empty days, then a few spikes.

const DAYS: ReadonlyArray<readonly [string, number]> = [
  ["09-13", 4], ["09-14", 0], ["09-15", 2], ["09-16", 0], ["09-17", 15], ["09-18", 23], ["09-19", 18],
  ["09-20", 34], ["09-21", 24], ["09-22", 27], ["09-23", 15], ["09-24", 1], ["09-25", 2], ["09-26", 2],
  ["09-27", 1], ["09-28", 1], ["09-29", 3], ["09-30", 0], ["10-01", 1], ["10-02", 2], ["10-03", 0],
  ["10-04", 0], ["10-05", 1], ["10-06", 16], ["10-07", 73], ["10-08", 17], ["10-09", 1],
];

const MAX = Math.max(...DAYS.map(([, n]) => n));

export function StartupOwnImpressionsBars() {
  const zeroDays = DAYS.filter(([, n]) => n === 0).length;
  const total = DAYS.reduce((s, [, n]) => s + n, 0);
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Impressions per day, dispatchseo.com</p>
      <div className="mt-3 flex h-28 items-end gap-1" aria-hidden="true">
        {DAYS.map(([d, n]) => (
          <div key={d} className="flex-1 rounded-t bg-violet-500/70" style={{ height: `${Math.max((n / MAX) * 100, n > 0 ? 3 : 0)}%` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-300">
        <span><span className="font-semibold text-neutral-100">{total}</span> impressions in {DAYS.length} days</span>
        <span><span className="font-semibold text-neutral-100">{zeroDays}</span> days with none</span>
        <span>Peak: <span className="font-semibold text-neutral-100">73</span> on 10-07</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">
        Daily values: {DAYS.map(([d, n]) => `${d} ${n}`).join(", ")}.
      </p>
    </div>
  );
}
