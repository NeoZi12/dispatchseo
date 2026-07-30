// Conditions where self-hosting rank tracking beats a managed layer even
// though the raw API cost was never the deciding factor - the counterpart to
// <SelfHostPipelineFlow />'s build steps, not a restatement of them.

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
    title: "You already run crons and a database somewhere",
    detail: "the marginal cost of one more table and one more scheduled job is close to zero if that infrastructure already exists",
  },
  {
    title: "Your keyword set changes rarely",
    detail: "a small, fixed list tracked forever needs none of the alerting or multi-project complexity that makes a managed layer worth its keep",
  },
  {
    title: "You need request shapes a managed layer doesn't expose",
    detail: "unusual device or location combinations, or raw JSON feeding a different pipeline - control a wrapped product won't give you",
  },
  {
    title: "You're already paying for the API calls somewhere else",
    detail: "a tracker built around calls you make anyway is marginal engineering cost, not a new line item",
  },
  {
    title: "The bill was never the objection",
    detail: "at roughly $1.62/month for two dozen keywords, cost alone never justified buying anything - only the wiring did",
  },
] as const;

export function DiyWinsChecklist() {
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
