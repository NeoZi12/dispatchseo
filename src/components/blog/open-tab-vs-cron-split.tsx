// The two loops side by side: Mangools' own five-step manual workflow (each
// step named in its own docs) against the actual chain this project's crons
// and MCP tools run for the same jobs (src/app/api/cron/*, get_rankings).
// Structural, not a numbers claim - there's no fabricated benchmark here,
// just the real sequence of who does each step.

function TabIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h18M8 5v4" />
    </svg>
  );
}

function CronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

const MANUAL_LOOP = [
  { title: "Open KWFinder", detail: "type a seed keyword, note the ones worth pursuing" },
  { title: "Open SERPWatcher", detail: "add each keyword by hand to the tracked list" },
  { title: "Come back weekly", detail: "open the dashboard to read the new positions" },
  { title: "Open SiteProfiler", detail: "paste the URL again to check the site's own metrics" },
  { title: "Repeat next week", detail: "nothing carries over unless you open the tab" },
];

const SCHEDULED_LOOP = [
  { title: "Weekly research pass", detail: "keyword_ideas + check_serp run against your own DataForSEO account" },
  { title: "track_keywords adds the winner", detail: "no separate step to remember - the same run that found it tracks it" },
  { title: "Nightly cron checks position", detail: "runs whether or not anyone is looking that day" },
  { title: "get_rankings + get_domain_rank feed the report", detail: "the dashboard and get_cron_health surface it on your schedule" },
  { title: "A drafted guide or tool queues itself", detail: "the gap becomes a suggestion, not a task on your list" },
];

export function OpenTabVsCronSplit() {
  return (
    <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-neutral-200">
          <TabIcon />
          <h3 className="text-sm font-semibold">Mangools&apos; loop - you&apos;re every step</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {MANUAL_LOOP.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
      <div className="rounded-xl bg-neutral-900 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-violet-400">
          <CronIcon />
          <h3 className="text-sm font-semibold">DispatchSEO&apos;s loop - you&apos;re the review step</h3>
        </div>
        <ul className="mt-3 divide-y divide-neutral-800/70">
          {SCHEDULED_LOOP.map((item) => (
            <li key={item.title} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
