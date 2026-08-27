// Five concrete deciding factors, each resolved against a documented limit or
// a real fact from this project's own schedule - not a generic "it depends."

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
    title: "Ticks more often than once an hour",
    detail: "A routine's schedule trigger rejects anything tighter than 1 hour - this project's own 10-minute queue drain needs a real cron.",
  },
  {
    title: "Fires more than a couple dozen times a day",
    detail: "Routines cap out at 5-25 runs/day by plan. A cron endpoint has no platform-side run cap at all.",
  },
  {
    title: "Has to remember something between runs",
    detail: "A routine carries no built-in memory across runs; a cron job can read and write any state store you point it at.",
  },
  {
    title: "Bills through a Console API key, not a claude.ai seat",
    detail: "Routines require a Pro/Max/Team/Enterprise claude.ai login - a pure ANTHROPIC_API_KEY setup can't create one at all.",
  },
  {
    title: "Only needs to react to a GitHub PR or release",
    detail: "That's the one shape a routine covers natively via its GitHub trigger, with no workflow file to write.",
  },
] as const;

export function RoutineOrCronChecklist() {
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
