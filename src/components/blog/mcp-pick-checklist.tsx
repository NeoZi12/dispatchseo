// The three questions this guide argues you should actually ask before
// adding a server - the decision version of the category grid above.

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

const QUESTIONS = [
  {
    title: "Does the task need something Claude doesn't already know?",
    detail: "reach for a research/context server - it fetches, it never changes anything, and it forgets the moment the call returns.",
  },
  {
    title: "Does the task need to click, type, or open a pull request outside this conversation?",
    detail: "reach for an action server (browser or repo) - it has real side effects, so scope its permissions like you mean it.",
  },
  {
    title: "Does the task need to remember this across separate sessions or callers?",
    detail: "reach for a state server - the only category built to still know something tomorrow.",
  },
] as const;

export function McpPickChecklist() {
  return (
    <div className="not-prose my-6 rounded-xl bg-neutral-900 p-4 sm:p-5">
      <ul className="divide-y divide-neutral-800/70">
        {QUESTIONS.map((q) => (
          <li key={q.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
            <span className="mt-0.5 text-violet-400">
              <CheckIcon />
            </span>
            <div>
              <p className="text-sm font-medium text-neutral-100">{q.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{q.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
