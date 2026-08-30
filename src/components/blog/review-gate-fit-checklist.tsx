// When a propose-then-approve pause is actually earning its keep, versus
// just adding a click - four concrete conditions, not a generic "it depends."

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
    title: "The blast radius is hard to undo",
    detail: "A schema migration, a force-push, a delete across many files - the kind of action plan mode's edit block and a dashboard's pending queue both exist to catch before it runs, not after.",
  },
  {
    title: "Nobody is watching the session in real time",
    detail: "A scheduled build with no one at the terminal - the exact case DispatchSEO's Semi-automatic mode targets, where a bad call would otherwise ship unseen until the PR lands.",
  },
  {
    title: "The agent is inside conventions it doesn't already know",
    detail: "An unfamiliar repo or a first pass at a new content type - plan mode's read-then-propose order matches how a careful engineer would approach the same unfamiliar code.",
  },
  {
    title: "Approval and rejection genuinely lead somewhere different",
    detail: "If the answer is always yes, the pause is just a click. It earns its keep when \"no, keep planning\" or a pending suggestion would actually change what happens next.",
  },
] as const;

export function ReviewGateFitChecklist() {
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
