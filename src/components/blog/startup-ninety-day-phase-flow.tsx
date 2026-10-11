// The four phases of a zero-authority site's first 90 days, left to right,
// each with the one job that phase exists for. Shown right after the answer
// so the whole plan is scannable before the detail sections.

const ICON = "h-5 w-5";

function FlagIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 4 2 4H5" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.8" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M12 4l8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden="true">
      <path d="M4 20h16" />
      <path d="M7 20v-6M12 20V9M17 20v-10" />
    </svg>
  );
}

const PHASES = [
  { icon: <FlagIcon />, when: "Day 0", job: "Get seen", detail: "Verify Search Console, submit the sitemap, confirm each page is indexed." },
  { icon: <TargetIcon />, when: "Days 1-30", job: "Pick winnable keywords", detail: "Low difficulty, mid-tail, commercial intent first." },
  { icon: <LayersIcon />, when: "Days 31-60", job: "Publish steadily", detail: "One page at a time, linked to each other, on one topic." },
  { icon: <ChartIcon />, when: "Days 61-90", job: "Read and double down", detail: "Find the cluster that gets impressions and feed it." },
] as const;

export function StartupNinetyDayPhaseFlow() {
  return (
    <ol className="not-prose my-6 grid gap-3 sm:grid-cols-4">
      {PHASES.map((p, i) => (
        <li key={p.when} className="relative rounded-xl bg-neutral-900 p-4 sm:p-5">
          <div className="flex items-center gap-2 text-violet-400">
            {p.icon}
            <span className="text-xs uppercase tracking-wide text-neutral-500">{p.when}</span>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold text-neutral-100">{p.job}</h3>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">{p.detail}</p>
          {i < PHASES.length - 1 && (
            <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-neutral-600 sm:block" aria-hidden="true">
              &rarr;
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
