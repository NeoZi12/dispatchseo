// The honest signal check for whether the free-tool pile is still fine as-is
// or has quietly become its own chore - the "other model" gets exactly one
// bounded mention here, not spread across the piece.

function CheckIcon() {
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
      <path d="m8.5 12.5 2.5 2.5 4.5-5" />
    </svg>
  );
}

const ITEMS = [
  {
    title: "You've re-run the same Keyword Planner search twice",
    detail: "because nothing wrote down what it returned the first time",
  },
  {
    title: "You've burned a SERP API's free monthly searches by week three",
    detail: "checking one keyword's position by hand instead of on a schedule",
  },
  {
    title: "The Screaming Frog crawl told you something worth fixing",
    detail: "and the free version had already forgotten it by the time you opened the report again",
  },
  {
    title: "The \"best free tools\" list you bookmarked is still an open tab",
    detail: "unopened since the day you saved it",
  },
  {
    title: "You want one project remembering all of this instead of you",
    detail: "which is the whole difference DispatchSEO's self-hosted mode is built around - the same free data sources, wired into one system that schedules and queues on its own",
  },
] as const;

export function PileVsSystemChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {ITEMS.map((item) => (
          <li key={item.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <CheckIcon />
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-100">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{item.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
