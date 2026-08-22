// Every date and gap below comes straight from get_pages, read live in the
// session that wrote this guide: the ten most recent DispatchSEO guides
// before this one, in publish order. The gaps aren't a capability claim -
// they're the site's self-imposed one-guide-per-day pace gate holding, which
// is exactly the "does an approved idea actually become a live page"
// question a Content Guard alert never answers on its own.

const SHIPS = [
  { date: "Aug 12", gapHours: null },
  { date: "Aug 13", gapHours: 27.5 },
  { date: "Aug 14", gapHours: 24.0 },
  { date: "Aug 15", gapHours: 22.8 },
  { date: "Aug 16", gapHours: 24.1 },
  { date: "Aug 17", gapHours: 24.0 },
  { date: "Aug 18", gapHours: 24.0 },
  { date: "Aug 19", gapHours: 21.7 },
  { date: "Aug 20", gapHours: 24.0 },
  { date: "Aug 21", gapHours: 26.4 },
] as const;

export function GuideShipCadenceTimeline() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          dispatchseo.com&apos;s own publish log, last 10 guides
        </h3>
        <p className="text-xs text-neutral-500">
          7 guides shipped in the last 7 days - avg gap <span className="tabular-nums text-cyan-300">24.3h</span>
        </p>
      </div>
      <div className="mt-6 overflow-x-auto pb-1">
        <div className="flex min-w-[640px] items-center">
          {SHIPS.map((s, i) => (
            <div key={s.date} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center">
                <span className="h-2.5 w-2.5 rounded-full bg-cyan-400" />
                <span className="mt-2 font-mono text-[11px] text-neutral-400">{s.date}</span>
              </div>
              {i < SHIPS.length - 1 ? (
                <div className="mx-1.5 flex flex-1 flex-col items-center">
                  <div className="h-px w-full bg-neutral-700" />
                  <span className="mt-1 whitespace-nowrap font-mono text-[10px] text-neutral-600">
                    {SHIPS[i + 1].gapHours}h
                  </span>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
