// Monthly Search Console impressions and clicks for one young site we run,
// pulled with get_site_stats on 2026-10-09 (daily snapshots summed by month;
// July starts 2026-07-16 and October covers 8 days). Shows that a young
// site's curve is lumpy, not a clean ramp. The printed numbers are the
// carrier; bar widths only decorate them.

const MONTHS = [
  { label: "Jul (from the 16th)", impressions: 1518, clicks: 0, width: "w-[19%]" },
  { label: "Aug", impressions: 8168, clicks: 5, width: "w-full" },
  { label: "Sep", impressions: 194, clicks: 12, width: "w-[3%]" },
  { label: "Oct (8 days)", impressions: 103, clicks: 1, width: "w-[2%]" },
] as const;

export function SaasSeoYoungSiteImpressionsBars() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Search Console impressions per month, one young site</p>
      <div className="mt-4 space-y-4">
        {MONTHS.map((m) => (
          <div key={m.label}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-100">{m.label}</h3>
              <p className="text-sm tabular-nums text-neutral-300">
                <span className="font-semibold text-amber-300">{m.impressions.toLocaleString("en-US")}</span> impressions, {m.clicks} clicks
              </p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-800" aria-hidden="true">
              <div className={`h-2 rounded-full bg-violet-500 ${m.width}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
