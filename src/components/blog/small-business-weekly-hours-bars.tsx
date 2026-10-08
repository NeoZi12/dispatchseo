// Planning estimate of owner hours per week for three ways of running SEO.
// These are our estimates for a one-site business, not measurements - the
// figure printed beside each bar is the carrier, the bar only decorates it.

const SETUPS = [
  { name: "Free stack by hand", hours: 4, width: "w-4/5", note: "Topic research, writing, publishing, the weekly Search Console check" },
  { name: "Paid suite on top", hours: 5, width: "w-full", note: "Same work plus a dashboard to read and reports to act on" },
  { name: "Automated manager", hours: 1, width: "w-1/5", note: "Approve ideas, review and merge the finished page" },
] as const;

export function SmallBusinessWeeklyHoursBars() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Owner hours per week, planning estimate</p>
      <div className="mt-4 space-y-5">
        {SETUPS.map((s) => (
          <div key={s.name}>
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-semibold text-neutral-100">{s.name}</h3>
              <p className="text-sm font-semibold text-amber-300">about {s.hours} h</p>
            </div>
            <div className="mt-2 h-2 w-full max-w-full overflow-hidden rounded-full bg-neutral-800" aria-hidden="true">
              <div className={`h-2 rounded-full bg-violet-500 ${s.width}`} />
            </div>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">{s.note}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
