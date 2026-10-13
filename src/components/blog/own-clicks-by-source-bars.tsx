// This site's own Search Console clicks over 28 days (2026-09-15 to 2026-10-12),
// read with get_site_stats while writing this guide. The window total is 10
// clicks and 284 impressions. In the daily top-query lists, 7 clicks are
// attributed to brand queries ("dispatch seo", "dispatchseo": 4 on 09-20,
// 2 on 09-22, 1 on 09-24). The other 3 clicks had no query row in the snapshot.
// The comparison ("alternative") pages logged impressions but zero clicks.
// Every value is real text; the bars are decoration.

const ROWS = [
  { label: "Clicks on brand-name queries", value: 7, tone: "bg-violet-500/70" },
  { label: "Clicks with no query listed", value: 3, tone: "bg-neutral-600" },
  { label: "Clicks on non-brand queries", value: 0, tone: "bg-amber-300/70" },
] as const;

export function OwnClicksBySourceBars() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Where dispatchseo.com&apos;s 10 clicks came from, last 28 days</p>
      <div className="mt-3 space-y-3">
        {ROWS.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-neutral-300">{r.label}</span>
              <span className="font-semibold text-neutral-100">{r.value}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-neutral-800" aria-hidden="true">
              <div className={`h-2 rounded-full ${r.tone}`} style={{ width: `${(r.value / 10) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-neutral-500">
        Window total: 10 clicks, 284 impressions. Non-brand queries behind the comparison pages sat around positions 40 to 90 and earned impressions only.
      </p>
    </div>
  );
}
